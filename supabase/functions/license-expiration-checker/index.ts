import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * License Expiration Checker Edge Function
 * Runs daily via cron job to check for expiring licenses and send notifications
 *
 * Schedule: Run daily at 9 AM UTC
 * Cron: 0 9 * * *
 */

/**
 * Check if a license expiry date is in grace period
 * Grace period is 30 days after expiry
 */
function isInGracePeriod(expiryDate: string): boolean {
  const expiry = new Date(expiryDate);
  const now = new Date();
  const thirtyDaysAfterExpiry = new Date(expiry);
  thirtyDaysAfterExpiry.setDate(thirtyDaysAfterExpiry.getDate() + 30);

  return expiry < now && now <= thirtyDaysAfterExpiry;
}

/**
 * Calculate days until expiry (negative if expired)
 */
function daysUntilExpiry(expiryDate: string): number {
  const expiry = new Date(expiryDate);
  const now = new Date();
  return Math.ceil((expiry.getTime() - now.getTime()) / (1000 * 60 * 60 * 24));
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting license expiration check...");

    // Check for licenses expiring in 30, 14, 7, or 1 days
    const targetDays = [30, 14, 7, 1];
    let totalNotificationsSent = 0;

    for (const days of targetDays) {
      const count = await checkAndNotifyExpiringLicenses(supabase, days);
      totalNotificationsSent += count;
      console.log(`Sent ${count} notifications for ${days}-day expiry`);
    }

    // Check for expired licenses (grace period)
    const expiredCount = await checkAndNotifyExpiredLicenses(supabase);
    totalNotificationsSent += expiredCount;
    console.log(`Sent ${expiredCount} notifications for expired licenses`);

    return new Response(
      JSON.stringify({
        success: true,
        notifications_sent: totalNotificationsSent,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in license expiration checker:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});

/**
 * Check and notify for licenses expiring in X days
 */
async function checkAndNotifyExpiringLicenses(
  supabase: any,
  daysUntilExpiry: number,
): Promise<number> {
  const targetDate = new Date();
  targetDate.setDate(targetDate.getDate() + daysUntilExpiry);
  targetDate.setHours(0, 0, 0, 0);

  const nextDay = new Date(targetDate);
  nextDay.setDate(nextDay.getDate() + 1);

  // Get licenses expiring on this date
  const { data: expiringLicenses, error: licenseError } = await supabase
    .from("organization_licenses")
    .select(
      `
      *,
      organizations (
        id,
        name,
        owner_id
      )
    `,
    )
    .gte("expires_at", targetDate.toISOString())
    .lt("expires_at", nextDay.toISOString())
    .order("expires_at", { ascending: true });

  if (licenseError) {
    console.error(
      `Error fetching ${daysUntilExpiry}-day expiring licenses:`,
      licenseError,
    );
    return 0;
  }

  if (!expiringLicenses || expiringLicenses.length === 0) {
    console.log(`No licenses expiring in ${daysUntilExpiry} days`);
    return 0;
  }

  let sentCount = 0;

  for (const license of expiringLicenses) {
    const notificationType = `${daysUntilExpiry}_day`;

    // Check if notification already sent today
    const { data: existingNotification } = await supabase
      .from("license_notifications")
      .select("id")
      .eq("license_id", license.id)
      .eq("notification_type", notificationType)
      .gte("sent_at", new Date().toISOString().split("T")[0]) // Today
      .maybeSingle();

    if (existingNotification) {
      console.log(
        `Notification already sent for license ${license.id} (${notificationType})`,
      );
      continue;
    }

    // Get organization owner email
    const { data: owner } = await supabase.auth.admin.getUserById(
      license.organizations.owner_id,
    );

    if (!owner || !owner.user) {
      console.error(
        `Owner not found for organization ${license.organizations.id}`,
      );
      continue;
    }

    // Send email notification
    const emailSent = await sendExpirationEmail(
      license,
      license.organizations,
      owner.user,
      daysUntilExpiry,
    );

    // Record notification
    await supabase.from("license_notifications").insert({
      organization_id: license.organization_id,
      license_id: license.id,
      notification_type: notificationType,
      email_sent: emailSent,
    });

    if (emailSent) {
      sentCount++;
    }
  }

  return sentCount;
}

/**
 * Check and notify for expired licenses (in grace period or beyond)
 */
async function checkAndNotifyExpiredLicenses(supabase: any): Promise<number> {
  const now = new Date();
  const gracePeriodEnd = new Date();
  gracePeriodEnd.setDate(gracePeriodEnd.getDate() - 30); // 30 days ago

  // Get expired licenses
  const { data: expiredLicenses, error } = await supabase
    .from("organization_licenses")
    .select(
      `
      *,
      organizations (
        id,
        name,
        owner_id
      )
    `,
    )
    .lt("expires_at", now.toISOString())
    .order("expires_at", { ascending: true });

  if (error) {
    console.error("Error fetching expired licenses:", error);
    return 0;
  }

  if (!expiredLicenses || expiredLicenses.length === 0) {
    return 0;
  }

  let sentCount = 0;

  for (const license of expiredLicenses) {
    const expiryDate = new Date(license.expires_at);
    const daysExpired = Math.ceil(
      (now.getTime() - expiryDate.getTime()) / (1000 * 60 * 60 * 24),
    );

    // Only send notifications for licenses expired 1-30 days (grace period)
    if (daysExpired < 1 || daysExpired > 30) {
      continue;
    }

    // Check if expired notification already sent recently (within last 7 days)
    const sevenDaysAgo = new Date();
    sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);

    const { data: recentNotification } = await supabase
      .from("license_notifications")
      .select("id")
      .eq("license_id", license.id)
      .eq("notification_type", "expired")
      .gte("sent_at", sevenDaysAgo.toISOString())
      .maybeSingle();

    if (recentNotification) {
      continue;
    }

    // Get organization owner
    const { data: owner } = await supabase.auth.admin.getUserById(
      license.organizations.owner_id,
    );

    if (!owner || !owner.user) {
      continue;
    }

    // Send expired notification
    const emailSent = await sendExpiredEmail(
      license,
      license.organizations,
      owner.user,
      daysExpired,
    );

    // Record notification
    await supabase.from("license_notifications").insert({
      organization_id: license.organization_id,
      license_id: license.id,
      notification_type: "expired",
      email_sent: emailSent,
    });

    if (emailSent) {
      sentCount++;
    }
  }

  return sentCount;
}

/**
 * Send expiration warning email
 */
async function sendExpirationEmail(
  license: any,
  organization: any,
  owner: any,
  daysUntilExpiry: number,
): Promise<boolean> {
  try {
    const subject = `Your MepSketcher license expires in ${daysUntilExpiry} days`;
    const expiryDate = new Date(license.expires_at).toLocaleDateString(
      "en-US",
      {
        year: "numeric",
        month: "long",
        day: "numeric",
      },
    );

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #007bff 0%, #0056b3 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e0e0e0; }
        .warning-box { background: #fff3cd; border-left: 4px solid #ff9800; padding: 16px; margin: 20px 0; border-radius: 4px; }
        .button { display: inline-block; padding: 14px 28px; background: #007bff; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        .details { background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; }
        .details-row { display: flex; justify-content: space-between; padding: 8px 0; border-bottom: 1px solid #e0e0e0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>License Expiration Notice</h1>
        </div>
        <div class="content">
            <p>Hello,</p>
            
            <div class="warning-box">
                <strong>⚠️ Your MepSketcher license expires in ${daysUntilExpiry} days</strong>
            </div>
            
            <p>This is a reminder that your MepSketcher license for <strong>${organization.name}</strong> will expire soon.</p>
            
            <div class="details">
                <h3>License Details</h3>
                <div class="details-row">
                    <span>Organization:</span>
                    <span><strong>${organization.name}</strong></span>
                </div>
                <div class="details-row">
                    <span>License Count:</span>
                    <span><strong>${license.total_licenses} licenses</strong></span>
                </div>
                <div class="details-row">
                    <span>Expiry Date:</span>
                    <span><strong>${expiryDate}</strong></span>
                </div>
                <div class="details-row">
                    <span>Days Remaining:</span>
                    <span><strong style="color: #dc3545;">${daysUntilExpiry} days</strong></span>
                </div>
            </div>
            
            <p><strong>What happens when your license expires?</strong></p>
            <ul>
                <li>You'll have a 30-day grace period with limited functionality</li>
                <li>After 30 days, access will be suspended</li>
                <li>Your data will be preserved for future renewal</li>
            </ul>
            
            <center>
                <a href="https://mepsketcher.com/dashboard" class="button">Renew License Now</a>
            </center>
            
            <p style="margin-top: 30px;">If you have any questions, please don't hesitate to contact our support team at support@mepsketcher.com</p>
            
            <p>Best regards,<br>The MepSketcher Team</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} MepSketcher. All rights reserved.</p>
            <p>This is an automated notification about your license status.</p>
        </div>
    </div>
</body>
</html>
    `;

    // Send email using Supabase Auth (or integrate with SendGrid/Resend)
    // For now, using console log as placeholder
    console.log(`Would send email to ${owner.email}: ${subject}`);

    // TODO: Integrate with actual email service
    // Example with Resend:
    // const resendApiKey = Deno.env.get("RESEND_API_KEY");
    // const response = await fetch("https://api.resend.com/emails", {
    //   method: "POST",
    //   headers: {
    //     "Authorization": `Bearer ${resendApiKey}`,
    //     "Content-Type": "application/json",
    //   },
    //   body: JSON.stringify({
    //     from: "MepSketcher <notifications@mepsketcher.com>",
    //     to: owner.email,
    //     subject: subject,
    //     html: htmlContent,
    //   }),
    // });

    return true; // Change to actual send result
  } catch (error) {
    console.error("Error sending expiration email:", error);
    return false;
  }
}

/**
 * Send expired license email (grace period)
 */
async function sendExpiredEmail(
  license: any,
  organization: any,
  owner: any,
  daysExpired: number,
): Promise<boolean> {
  try {
    const graceDaysRemaining = Math.max(0, 30 - daysExpired);
    const subject =
      graceDaysRemaining > 0
        ? `Your MepSketcher license has expired - ${graceDaysRemaining} days left in grace period`
        : `Your MepSketcher license has been suspended`;

    const htmlContent = `
<!DOCTYPE html>
<html>
<head>
    <style>
        body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { background: linear-gradient(135deg, #dc3545 0%, #c82333 100%); color: white; padding: 30px; text-align: center; border-radius: 8px 8px 0 0; }
        .content { background: white; padding: 30px; border: 1px solid #e0e0e0; }
        .critical-box { background: #f8d7da; border-left: 4px solid #dc3545; padding: 16px; margin: 20px 0; border-radius: 4px; }
        .button { display: inline-block; padding: 14px 28px; background: #dc3545; color: white; text-decoration: none; border-radius: 6px; font-weight: 600; margin: 20px 0; }
        .details { background: #f8f9fa; padding: 20px; border-radius: 6px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px; color: #666; font-size: 14px; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <h1>🚫 License Expired</h1>
        </div>
        <div class="content">
            <p>Hello,</p>
            
            <div class="critical-box">
                <strong>Your MepSketcher license has expired</strong>
            </div>
            
            ${
              graceDaysRemaining > 0
                ? `
                <p>Your license for <strong>${organization.name}</strong> expired ${daysExpired} days ago. You have <strong>${graceDaysRemaining} days remaining</strong> in your grace period.</p>
                
                <p><strong>During the grace period:</strong></p>
                <ul>
                    <li>You have limited access to MepSketcher</li>
                    <li>Some features may be restricted</li>
                    <li>Your data is safe and preserved</li>
                </ul>
                
                <p style="color: #dc3545;"><strong>Renew within ${graceDaysRemaining} days to restore full access.</strong></p>
            `
                : `
                <p>Your license for <strong>${organization.name}</strong> expired over 30 days ago and your grace period has ended.</p>
                
                <p><strong>Your account status:</strong></p>
                <ul>
                    <li>Access to MepSketcher is suspended</li>
                    <li>Your data is preserved for 90 days</li>
                    <li>Renew to restore immediate access</li>
                </ul>
            `
            }
            
            <center>
                <a href="https://mepsketcher.com/dashboard" class="button">Renew License Now</a>
            </center>
            
            <p style="margin-top: 30px;">Need help? Contact us at support@mepsketcher.com</p>
            
            <p>Best regards,<br>The MepSketcher Team</p>
        </div>
        <div class="footer">
            <p>© ${new Date().getFullYear()} MepSketcher. All rights reserved.</p>
        </div>
    </div>
</body>
</html>
    `;

    console.log(`Would send expired email to ${owner.email}: ${subject}`);

    // TODO: Integrate with actual email service

    return true; // Change to actual send result
  } catch (error) {
    console.error("Error sending expired email:", error);
    return false;
  }
}

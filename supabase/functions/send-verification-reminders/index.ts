// Edge Function: send-verification-reminders
// Purpose: Resend the account-confirmation email as a reminder to users who signed up
//          but never confirmed (auth.users.email_confirmed_at IS NULL).
//          Cadence: 1st reminder at 3 days, 2nd at 7 days, then stop.
// Invoked by: daily pg_cron job (see setup-verification-reminders-cron.sql).
// Created: 2026-06-17

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Verification token lifetime for reminders. More lenient than signup's 24h since
// the user has already shown they are slow to act.
const TOKEN_TTL_HOURS = 72;

interface DueReminder {
  pending_id: string;
  auth_id: string;
  user_email: string;
  user_name: string | null;
  organization_name: string;
  reminder_count: number;
}

// Generate a cryptographically secure random token (32 bytes -> 64 hex chars,
// matching the length the verify-email function expects).
function generateSecureToken(length = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

function buildEmail(userName: string | null, verifyUrl: string) {
  const greeting = userName ? `Hi ${userName},` : "Hi there,";

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">

    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #333; margin: 0; font-size: 24px;">Confirm your MepSketcher account</h1>
    </div>

    <p style="color: #555; font-size: 16px; line-height: 1.6;">
      ${greeting}
    </p>

    <p style="color: #555; font-size: 16px; line-height: 1.6;">
      You signed up for MepSketcher a few days ago but haven't confirmed your email address yet.
      Your account isn't active until you do. Confirm now to start using the app:
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${verifyUrl}"
         style="background-color: #007bff; color: white; padding: 12px 30px;
                text-decoration: none; border-radius: 5px; display: inline-block;
                font-weight: bold; font-size: 16px;">
        Confirm Email Address
      </a>
    </div>

    <p style="color: #777; font-size: 14px; line-height: 1.6;">
      Or copy and paste this link into your browser:
    </p>

    <p style="color: #007bff; font-size: 14px; word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
      ${verifyUrl}
    </p>

    <p style="color: #999; font-size: 13px; line-height: 1.6; margin-top: 30px;">
      <strong>This link expires in ${TOKEN_TTL_HOURS} hours.</strong> After that, you'll need to request a new confirmation email.
    </p>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <p style="color: #999; font-size: 13px; line-height: 1.6;">
      <strong>Didn't create an account?</strong> If you didn't sign up for MepSketcher, you can safely ignore this email.
    </p>

    <footer style="color: #999; font-size: 11px; text-align: center; margin-top: 30px;">
      &copy; 2026 MepSketcher. All rights reserved.
    </footer>
  </div>
</body>
</html>
`;

  const text = `
Confirm your MepSketcher account

${greeting}

You signed up for MepSketcher a few days ago but haven't confirmed your email address yet. Your account isn't active until you do. Confirm your email by clicking the link below:

${verifyUrl}

This link expires in ${TOKEN_TTL_HOURS} hours.

If you didn't create an account, you can safely ignore this email.

© 2026 MepSketcher. All rights reserved.
`;

  return { html, text };
}

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  // Authorize the cron caller via a shared secret. (verify_jwt is disabled for this
  // function because the cron job does not present a Supabase JWT.)
  const cronSecret = Deno.env.get("REMINDER_CRON_SECRET");
  if (!cronSecret) {
    console.error("REMINDER_CRON_SECRET not configured");
    return new Response(JSON.stringify({ error: "Server misconfigured" }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const authHeader = req.headers.get("Authorization");
  if (authHeader !== `Bearer ${cronSecret}`) {
    return new Response(JSON.stringify({ error: "Unauthorized" }), {
      status: 401,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  const dryRun = new URL(req.url).searchParams.get("dryRun") === "true";

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey =
      JSON.parse(Deno.env.get("SUPABASE_SECRET_KEYS")!)["default"];
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch the set of signups due for a reminder.
    const { data: dueRaw, error: dueError } = await supabase.rpc(
      "get_due_verification_reminders",
    );

    if (dueError) {
      console.error("Failed to fetch due reminders:", dueError);
      throw new Error(`Failed to fetch due reminders: ${dueError.message}`);
    }

    const due: DueReminder[] = dueRaw ?? [];
    console.log(`${due.length} signup(s) due for a reminder`);

    if (dryRun) {
      return new Response(
        JSON.stringify({
          dryRun: true,
          processed: due.length,
          due: due.map((d) => ({
            email: d.user_email,
            nextReminder: d.reminder_count + 1,
          })),
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("Email service not configured");
    }

    const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:8000";

    let sent = 0;
    let errors = 0;

    for (const reminder of due) {
      try {
        // 1. Mint a fresh verification token.
        const token = generateSecureToken(32);
        const expiresAt = new Date();
        expiresAt.setHours(expiresAt.getHours() + TOKEN_TTL_HOURS);

        const { error: insertError } = await supabase
          .from("email_verification_tokens")
          .insert({
            user_id: reminder.auth_id,
            email: reminder.user_email.toLowerCase(),
            token,
            expires_at: expiresAt.toISOString(),
            verified: false,
          });

        if (insertError) {
          console.error(
            `Token insert failed for ${reminder.user_email}:`,
            insertError,
          );
          errors++;
          continue;
        }

        // 2. Send the reminder email.
        const verifyUrl = `${siteUrl}/verify-email.html?token=${token}`;
        const { html, text } = buildEmail(reminder.user_name, verifyUrl);

        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${resendApiKey}`,
          },
          body: JSON.stringify({
            from: "MepSketcher <noreply@mepsketcher.com>",
            to: [reminder.user_email],
            subject: "Reminder: confirm your MepSketcher account",
            html,
            text,
          }),
        });

        if (!resendResponse.ok) {
          const resendError = await resendResponse.text();
          console.error(
            `Resend failed for ${reminder.user_email}:`,
            resendError,
          );
          errors++;
          // Counter not bumped -> retried on the next daily run.
          continue;
        }

        // 3. Record the send so we don't repeat it.
        const { error: updateError } = await supabase
          .from("pending_organizations")
          .update({
            reminder_count: reminder.reminder_count + 1,
            last_reminder_at: new Date().toISOString(),
          })
          .eq("id", reminder.pending_id);

        if (updateError) {
          // Email already sent; log but count as sent. The 7-day window guards
          // against an immediate duplicate even if the counter didn't advance.
          console.error(
            `Counter update failed for ${reminder.user_email}:`,
            updateError,
          );
        }

        sent++;
        console.log(
          `Reminder ${reminder.reminder_count + 1} sent to ${reminder.user_email}`,
        );
      } catch (perUserError) {
        console.error(
          `Error processing reminder for ${reminder.user_email}:`,
          perUserError,
        );
        errors++;
      }
    }

    return new Response(
      JSON.stringify({
        processed: due.length,
        sent,
        skipped: due.length - sent - errors,
        errors,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in send-verification-reminders:", error);
    const message =
      error instanceof Error ? error.message : "Unknown error occurred";
    return new Response(JSON.stringify({ error: message }), {
      status: 500,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }
});

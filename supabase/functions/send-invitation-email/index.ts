import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.38.4";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SITE_URL = Deno.env.get("SITE_URL") || "https://mepsketcher.com";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface InvitationRequest {
  invitationId: string;
  email: string;
  organizationName: string;
  inviterName: string;
  role: string;
}

/**
 * Generate secure random token (128 bits of entropy)
 */
function generateSecureToken(): string {
  const array = new Uint8Array(16);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    ""
  );
}

/**
 * Hash token using SHA-256 (one-way hash)
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Verify request is from authenticated user
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Missing authorization" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Verify user authentication
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser(token);

    if (authError || !user) {
      return new Response(JSON.stringify({ error: "Invalid authentication" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    const body: InvitationRequest = await req.json();
    const { invitationId, email, organizationName, inviterName, role } = body;

    if (!invitationId || !email || !organizationName || !inviterName || !role) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Generate secure token and hash it
    const plainToken = generateSecureToken();
    const tokenHash = await hashToken(plainToken);

    // Set expiration (7 days from now)
    const expiresAt = new Date();
    expiresAt.setDate(expiresAt.getDate() + 7);

    console.log(
      `Generated invitation token for ${email} (hash: ${tokenHash.substring(
        0,
        16
      )}...)`
    );

    // Update invitation with hashed token
    const { error: updateError } = await supabase
      .from("organization_members")
      .update({
        invite_token_hash: tokenHash,
        invite_token_sent_at: new Date().toISOString(),
        invitation_expires_at: expiresAt.toISOString(),
      })
      .eq("id", invitationId);

    if (updateError) {
      console.error("Error updating invitation token:", updateError);
      throw new Error("Failed to generate invitation token");
    }

    // Generate invitation URL with PLAIN token (user needs this)
    // The plain token is only sent via email, never stored
    // Include email and organization name as URL parameters for pre-filling the signup form
    const invitationUrl = `${SITE_URL}/accept-invitation.html?token=${plainToken}&email=${encodeURIComponent(
      email
    )}&org=${encodeURIComponent(organizationName)}`;

    console.log(`Sending invitation email to ${email}`);

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("Email service not configured");
    }

    // Send email via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "MepSketcher <noreply@mepsketcher.com>",
        to: [email],
        subject: `${inviterName} invited you to join ${organizationName} on MepSketcher`,
        html: generateInvitationEmailHTML({
          inviterName,
          organizationName,
          role,
          invitationUrl,
          expiresAt: expiresAt.toLocaleDateString(),
        }),
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend API error:", errorText);
      throw new Error(`Failed to send invitation email: ${errorText}`);
    }

    const emailData = await emailResponse.json();
    console.log("Invitation email sent successfully:", emailData.id);

    return new Response(
      JSON.stringify({
        success: true,
        emailId: emailData.id,
        expiresAt: expiresAt.toISOString(),
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending invitation:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function generateInvitationEmailHTML(params: {
  inviterName: string;
  organizationName: string;
  role: string;
  invitationUrl: string;
  expiresAt: string;
}): string {
  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>You're invited to ${params.organizationName}</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px; text-align: center;">
              <h1 style="margin: 0; color: #333333; font-size: 24px;">MepSketcher</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <h2 style="margin: 0 0 20px; color: #333333; font-size: 20px;">
                You've been invited!
              </h2>
              
              <p style="margin: 0 0 15px; color: #666666; font-size: 16px; line-height: 1.5;">
                <strong>${params.inviterName}</strong> has invited you to join 
                <strong>${params.organizationName}</strong> on MepSketcher as a 
                <strong>${params.role}</strong>.
              </p>
              
              <p style="margin: 0 0 30px; color: #666666; font-size: 16px; line-height: 1.5;">
                MepSketcher is a specialized CAD application for designing MEP (Mechanical, Electrical, and Plumbing) systems on PDF drawings.
              </p>
              
              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 20px 0;">
                    <a href="${params.invitationUrl}" 
                       style="display: inline-block; padding: 14px 40px; background-color: #0066cc; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 16px; font-weight: 600;">
                      Accept Invitation
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0 0; color: #999999; font-size: 14px; line-height: 1.5;">
                This invitation expires on <strong>${params.expiresAt}</strong>
              </p>
              
              <p style="margin: 15px 0 0; color: #999999; font-size: 14px; line-height: 1.5;">
                If the button doesn't work, copy and paste this link into your browser:<br>
                <a href="${
                  params.invitationUrl
                }" style="color: #0066cc; word-break: break-all;">
                  ${params.invitationUrl}
                </a>
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid #eeeeee; text-align: center;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                If you weren't expecting this invitation, you can safely ignore this email.
              </p>
              <p style="margin: 10px 0 0; color: #999999; font-size: 12px;">
                © ${new Date().getFullYear()} MepSketcher. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

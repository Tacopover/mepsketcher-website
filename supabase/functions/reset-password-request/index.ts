// Edge Function: reset-password-request
// Purpose: Handle password reset requests, generate tokens, and send emails
// Created: 2026-02-03

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  email: string;
}

// Generate a cryptographically secure random token
function generateSecureToken(length: number = 32): string {
  const array = new Uint8Array(length);
  crypto.getRandomValues(array);
  return Array.from(array, (byte) => byte.toString(16).padStart(2, "0")).join(
    "",
  );
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { email }: RequestBody = await req.json();

    // Validate email input
    if (!email || !email.includes("@")) {
      return new Response(JSON.stringify({ error: "Invalid email address" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Check if user exists in auth.users
    const { data: users, error: userError } =
      await supabase.auth.admin.listUsers();

    if (userError) {
      console.error("Error fetching users:", userError);
      throw userError;
    }

    const user = users?.users.find(
      (u) => u.email?.toLowerCase() === email.toLowerCase(),
    );

    // Security: Don't reveal if user exists or not
    // Always return success to prevent email enumeration
    if (!user) {
      console.log(`Password reset requested for non-existent email: ${email}`);
      return new Response(
        JSON.stringify({
          success: true,
          message: "If that email exists, a reset link has been sent.",
        }),
        {
          status: 200,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Generate secure reset token
    const token = generateSecureToken(32);
    const expiresAt = new Date();
    expiresAt.setHours(expiresAt.getHours() + 24); // 24 hours from now

    // Store token in database
    const { error: insertError } = await supabase
      .from("password_reset_tokens")
      .insert({
        user_id: user.id,
        email: email.toLowerCase(),
        token,
        expires_at: expiresAt.toISOString(),
        used: false,
      });

    if (insertError) {
      console.error("Error storing reset token:", insertError);
      throw insertError;
    }

    // Prepare reset URL
    const siteUrl = Deno.env.get("SITE_URL") || "http://localhost:8000";
    const resetUrl = `${siteUrl}/reset-password.html?token=${token}`;

    // Send email via Resend
    const resendApiKey = Deno.env.get("RESEND_API_KEY");
    if (!resendApiKey) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("Email service not configured");
    }

    const emailHtml = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin: 0; padding: 20px; font-family: Arial, sans-serif; background-color: #f4f4f4;">
  <div style="max-width: 600px; margin: 0 auto; background-color: white; padding: 40px; border-radius: 8px; box-shadow: 0 2px 4px rgba(0,0,0,0.1);">
    
    <div style="text-align: center; margin-bottom: 30px;">
      <h1 style="color: #333; margin: 0; font-size: 24px;">Reset Your Password</h1>
    </div>

    <p style="color: #555; font-size: 16px; line-height: 1.6;">
      You requested a password reset for your MepSketcher account.
    </p>

    <p style="color: #555; font-size: 16px; line-height: 1.6;">
      Click the button below to reset your password:
    </p>

    <div style="text-align: center; margin: 30px 0;">
      <a href="${resetUrl}" 
         style="background-color: #007bff; color: white; padding: 12px 30px; 
                text-decoration: none; border-radius: 5px; display: inline-block; 
                font-weight: bold; font-size: 16px;">
        Reset Password
      </a>
    </div>

    <p style="color: #777; font-size: 14px; line-height: 1.6;">
      Or copy and paste this link into your browser:
    </p>
    
    <p style="color: #007bff; font-size: 14px; word-break: break-all; background-color: #f8f9fa; padding: 10px; border-radius: 4px;">
      ${resetUrl}
    </p>

    <p style="color: #999; font-size: 13px; line-height: 1.6; margin-top: 30px;">
      <strong>This link expires in 24 hours.</strong> After that, you'll need to request a new password reset.
    </p>

    <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

    <p style="color: #999; font-size: 13px; line-height: 1.6;">
      <strong>Didn't request this?</strong> Your account is secure. If you didn't request a password reset, you can safely ignore this email.
    </p>

    <footer style="color: #999; font-size: 12px; text-align: center; margin-top: 30px;">
      &copy; 2026 MepSketcher. All rights reserved.
    </footer>
  </div>
</body>
</html>
    `;

    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${resendApiKey}`,
      },
      body: JSON.stringify({
        from: "MepSketcher <noreply@mepsketcher.com>",
        to: [email],
        subject: "Reset Your MepSketcher Password",
        html: emailHtml,
      }),
    });

    if (!emailResponse.ok) {
      const errorData = await emailResponse.text();
      console.error("Resend email error:", errorData);
      throw new Error("Failed to send email");
    }

    const emailData = await emailResponse.json();
    console.log("Password reset email sent:", emailData);

    return new Response(
      JSON.stringify({
        success: true,
        message: "If that email exists, a reset link has been sent.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in reset-password-request:", error);

    return new Response(
      JSON.stringify({
        error:
          "An error occurred while processing your request. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

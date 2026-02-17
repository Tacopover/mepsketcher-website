// Edge Function: verify-email
// Purpose: Verify email token and mark user as verified
// Created: 2026-02-03

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface RequestBody {
  token: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { token }: RequestBody = await req.json();

    // Validate token input
    if (!token || typeof token !== "string" || token.length !== 64) {
      return new Response(JSON.stringify({ error: "Invalid token format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch token from database
    const { data: tokenData, error: tokenError } = await supabase
      .from("email_verification_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenError || !tokenData) {
      console.error("Token lookup error:", tokenError);
      return new Response(
        JSON.stringify({
          error:
            "Invalid or expired verification link. Please request a new one.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate token hasn't already been verified
    if (tokenData.verified) {
      return new Response(
        JSON.stringify({
          error: "This email has already been verified. You can now log in.",
          already_verified: true,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate token hasn't expired
    const expiresAt = new Date(tokenData.expires_at);
    const now = new Date();
    if (now > expiresAt) {
      return new Response(
        JSON.stringify({
          error:
            "This verification link has expired. Please request a new one.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Update user's email_confirmed_at in auth.users
    const { error: updateError } = await supabase.auth.admin.updateUserById(
      tokenData.user_id,
      {
        email_confirm: true,
      },
    );

    if (updateError) {
      console.error("Error confirming user email:", updateError);
      // Try alternative method - update user metadata
      const { error: metadataError } = await supabase.auth.admin.updateUserById(
        tokenData.user_id,
        {
          user_metadata: { email_verified: true },
        },
      );

      if (metadataError) {
        console.error("Error updating user metadata:", metadataError);
        throw new Error("Failed to verify email");
      }
    }

    // Mark token as verified
    const { error: markVerifiedError } = await supabase
      .from("email_verification_tokens")
      .update({ verified: true })
      .eq("token", token);

    if (markVerifiedError) {
      console.error("Error marking token as verified:", markVerifiedError);
      // Don't fail the request since email was already verified
    }

    // NOTE: Do NOT delete pending_organizations entry here
    // The signin function will process pending organizations and delete them
    // after successfully creating the user's organization

    console.log(`Email successfully verified for user: ${tokenData.email}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Email verified successfully! You can now log in.",
        email: tokenData.email,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in verify-email:", error);

    return new Response(
      JSON.stringify({
        error:
          "An error occurred while verifying your email. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

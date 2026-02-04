// Edge Function: confirm-password-reset
// Purpose: Validate token and update user password
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
  password: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Parse request body
    const { token, password }: RequestBody = await req.json();

    // Validate inputs
    if (!token || typeof token !== "string" || token.length !== 64) {
      return new Response(JSON.stringify({ error: "Invalid token format" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    if (!password || password.length < 8) {
      return new Response(
        JSON.stringify({
          error: "Password must be at least 8 characters long",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Fetch token from database
    const { data: tokenData, error: tokenError } = await supabase
      .from("password_reset_tokens")
      .select("*")
      .eq("token", token)
      .single();

    if (tokenError || !tokenData) {
      console.error("Token lookup error:", tokenError);
      return new Response(
        JSON.stringify({
          error:
            "Invalid or expired token. Please request a new password reset.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate token hasn't been used
    if (tokenData.used) {
      return new Response(
        JSON.stringify({
          error:
            "This reset link has already been used. Please request a new password reset.",
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
            "This reset link has expired. Please request a new password reset.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Update user password using Supabase Auth Admin API
    const { data: updateData, error: updateError } =
      await supabase.auth.admin.updateUserById(tokenData.user_id, { password });

    if (updateError) {
      console.error("Password update error:", updateError);
      return new Response(
        JSON.stringify({
          error:
            updateError.message ||
            "Failed to update password. Please try again.",
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Mark token as used
    const { error: markUsedError } = await supabase
      .from("password_reset_tokens")
      .update({ used: true })
      .eq("token", token);

    if (markUsedError) {
      console.error("Error marking token as used:", markUsedError);
      // Don't fail the request since password was already updated
    }

    console.log(`Password successfully reset for user: ${tokenData.email}`);

    return new Response(
      JSON.stringify({
        success: true,
        message: "Password updated successfully!",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in confirm-password-reset:", error);

    return new Response(
      JSON.stringify({
        error: "An unexpected error occurred. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

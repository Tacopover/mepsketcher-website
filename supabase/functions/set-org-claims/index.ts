/**
 * DEPRECATED: This edge function is no longer actively used.
 *
 * As of the RLS policy update, JWT claims (org_id, org_role) are no longer
 * required for authorization. RLS policies now query the database directly
 * instead of relying on JWT claims in app_metadata.
 *
 * This function is preserved for potential future use or reference.
 *
 * Previous purpose:
 * - Set organization context (org_id and org_role) in user's JWT app_metadata
 * - Called after login or when organization membership changed
 * - Required session refresh to get updated JWT with new claims
 */

import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Create Supabase client with SERVICE ROLE (can modify auth.users)
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      {
        auth: {
          autoRefreshToken: false,
          persistSession: false,
        },
      }
    );

    // Get user from JWT
    const authHeader = req.headers.get("Authorization")!;
    const token = authHeader.replace("Bearer ", "");

    const {
      data: { user },
      error: userError,
    } = await supabaseAdmin.auth.getUser(token);

    if (userError || !user) {
      console.error("Auth error:", userError);
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    console.log(`Setting claims for user: ${user.id} (${user.email})`);

    // Get user's active organization membership
    const { data: membership, error: memberError } = await supabaseAdmin
      .from("organization_members")
      .select("organization_id, role")
      .eq("user_id", user.id)
      .eq("status", "active")
      .single();

    if (memberError || !membership) {
      console.error("No active membership found:", memberError);
      return new Response(
        JSON.stringify({
          error: "No active organization membership found",
          details: memberError?.message,
        }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `Found membership: org=${membership.organization_id}, role=${membership.role}`
    );

    // Update user's app_metadata using Admin API
    const { data: updatedUser, error: updateError } =
      await supabaseAdmin.auth.admin.updateUserById(user.id, {
        app_metadata: {
          org_id: membership.organization_id,
          org_role: membership.role,
        },
      });

    if (updateError) {
      console.error("Error updating user metadata:", updateError);
      return new Response(
        JSON.stringify({
          error: "Failed to update user metadata",
          details: updateError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Successfully updated claims:", updatedUser.app_metadata);

    return new Response(
      JSON.stringify({
        success: true,
        org_id: membership.organization_id,
        org_role: membership.role,
        message: "Claims updated successfully. Please refresh your session.",
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Unexpected error:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        details: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

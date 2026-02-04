// Edge Function: verify-invitation-token
// Purpose: Verify invitation token and return invitation details
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

/**
 * Hash token using SHA-256
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
    // Parse request body
    const { token }: RequestBody = await req.json();

    // Validate token input
    if (!token || typeof token !== "string") {
      return new Response(JSON.stringify({ error: "Invalid token" }), {
        status: 400,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase client with service role
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Hash the token
    const tokenHash = await hashToken(token);

    // Fetch invitation from database
    const { data: invitation, error: invitationError } = await supabase
      .from("organization_members")
      .select(
        `
        id,
        email,
        role,
        status,
        invitation_expires_at,
        organization_id,
        organizations (
          name,
          owner_id
        )
      `,
      )
      .eq("invite_token_hash", tokenHash)
      .eq("status", "pending")
      .maybeSingle();

    if (invitationError) {
      console.error("Error querying invitation:", invitationError);
      return new Response(
        JSON.stringify({ error: "Error checking invitation" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!invitation) {
      return new Response(
        JSON.stringify({ error: "Invitation not found or already used" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if expired
    const expiresAt = new Date(invitation.invitation_expires_at);
    if (expiresAt < new Date()) {
      return new Response(
        JSON.stringify({
          error:
            "This invitation has expired. Please contact the organization administrator for a new invitation.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get inviter name
    const { data: inviterProfile } = await supabase
      .from("user_profiles")
      .select("name")
      .eq("id", invitation.organizations.owner_id)
      .single();

    console.log(`Invitation verified for: ${invitation.email}`);

    return new Response(
      JSON.stringify({
        success: true,
        invitation: {
          email: invitation.email,
          role: invitation.role,
          organizationName: invitation.organizations.name,
          inviterName: inviterProfile?.name || "Someone",
          expiresAt: invitation.invitation_expires_at,
        },
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in verify-invitation-token:", error);

    return new Response(
      JSON.stringify({
        error:
          "An error occurred while verifying your invitation. Please try again.",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

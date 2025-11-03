import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface AssignTrialUserRequest {
  trial_user_email: string;
  license_id: string;
}

serve(async (req) => {
  // Handle CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    // Initialize Supabase client with service role
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

    // Get requesting user from JWT
    const authHeader = req.headers.get("authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user: requestingUser },
      error: authError,
    } = await supabaseAdmin.auth.getUser(token);

    if (authError || !requestingUser) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    const { trial_user_email, license_id }: AssignTrialUserRequest = await req
      .json();

    if (!trial_user_email || !license_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `Processing request to assign trial user ${trial_user_email} to license ${license_id}`
    );

    // Verify requesting user is an admin
    const { data: adminData, error: adminError } = await supabaseAdmin
      .from("users")
      .select("role, organization_id")
      .eq("id", requestingUser.id)
      .single();

    if (adminError || !adminData) {
      console.error("Error fetching admin data:", adminError);
      return new Response(
        JSON.stringify({ error: "Failed to verify admin status" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (adminData.role !== "admin") {
      return new Response(
        JSON.stringify({ error: "Only admins can assign users to licenses" }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const admin_org_id = adminData.organization_id;

    // Verify the license belongs to the admin's organization
    const { data: licenseData, error: licenseError } = await supabaseAdmin
      .from("licenses")
      .select("organization_id, seats_total, seats_used")
      .eq("id", license_id)
      .single();

    if (licenseError || !licenseData) {
      console.error("Error fetching license:", licenseError);
      return new Response(
        JSON.stringify({ error: "License not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (licenseData.organization_id !== admin_org_id) {
      return new Response(
        JSON.stringify({
          error: "License does not belong to your organization",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Check if license has available seats
    if (licenseData.seats_used >= licenseData.seats_total) {
      return new Response(
        JSON.stringify({ error: "No available seats on this license" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Find the trial user
    const { data: trialUser, error: trialUserError } = await supabaseAdmin
      .from("users")
      .select("id, organization_id, organizations(id, name, is_personal_trial_org)")
      .eq("email", trial_user_email)
      .single();

    if (trialUserError || !trialUser) {
      console.error("Error fetching trial user:", trialUserError);
      return new Response(
        JSON.stringify({ error: "User not found" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Verify user is in a personal trial org
    const userOrg = Array.isArray(trialUser.organizations)
      ? trialUser.organizations[0]
      : trialUser.organizations;

    if (!userOrg?.is_personal_trial_org) {
      return new Response(
        JSON.stringify({
          error:
            "User is not in a trial organization or already belongs to another organization",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    const old_org_id = trialUser.organization_id;

    console.log(
      `Moving user ${trial_user_email} from personal org ${old_org_id} to org ${admin_org_id}`
    );

    // Update user's organization and role
    const { error: updateUserError } = await supabaseAdmin
      .from("users")
      .update({
        organization_id: admin_org_id,
        role: "member", // Demote from admin of personal org to member
      })
      .eq("id", trialUser.id);

    if (updateUserError) {
      console.error("Error updating user organization:", updateUserError);
      return new Response(
        JSON.stringify({ error: "Failed to assign user to organization" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Update user's license assignment
    const { error: updateLicenseError } = await supabaseAdmin
      .from("user_licenses")
      .update({ license_id: license_id })
      .eq("user_id", trialUser.id);

    if (updateLicenseError) {
      console.error("Error updating user license:", updateLicenseError);
      // Rollback user organization change
      await supabaseAdmin
        .from("users")
        .update({
          organization_id: old_org_id,
          role: "admin",
        })
        .eq("id", trialUser.id);

      return new Response(
        JSON.stringify({ error: "Failed to assign license to user" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Increment seats_used on the license
    const { error: incrementSeatsError } = await supabaseAdmin
      .from("licenses")
      .update({ seats_used: licenseData.seats_used + 1 })
      .eq("id", license_id);

    if (incrementSeatsError) {
      console.error("Error incrementing seats_used:", incrementSeatsError);
      // Non-fatal - continue with cleanup
    }

    // Delete the old personal trial organization
    const { error: deleteOrgError } = await supabaseAdmin
      .from("organizations")
      .delete()
      .eq("id", old_org_id)
      .eq("is_personal_trial_org", true); // Safety check

    if (deleteOrgError) {
      console.error(
        "Error deleting personal trial organization:",
        deleteOrgError
      );
      // Non-fatal - org will be orphaned but user is still successfully transferred
    } else {
      console.log(`Successfully deleted personal trial org ${old_org_id}`);
    }

    return new Response(
      JSON.stringify({
        success: true,
        message: `User ${trial_user_email} successfully added to organization`,
        user_id: trialUser.id,
        organization_id: admin_org_id,
        license_id: license_id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error assigning trial user:", error);
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

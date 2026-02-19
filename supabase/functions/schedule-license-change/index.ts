import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface ScheduleLicenseChangeRequest {
  organizationId: string;
  newQuantity: number;
  effectiveDate: string;
  cancelAtRenewal?: boolean;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create Supabase client
    const supabaseClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get the authorization header
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: "Missing authorization header" }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify the user is authenticated
    const token = authHeader.replace("Bearer ", "");
    const {
      data: { user },
      error: userError,
    } = await supabaseClient.auth.getUser(token);

    if (userError || !user) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      });
    }

    // Parse request body
    let body: ScheduleLicenseChangeRequest;
    try {
      body = await req.json();
    } catch (parseError) {
      console.error("Failed to parse request body:", parseError);
      return new Response(
        JSON.stringify({
          error: "Invalid JSON in request body",
          details:
            parseError instanceof Error ? parseError.message : "Unknown error",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const { organizationId, newQuantity, effectiveDate, cancelAtRenewal } =
      body;

    console.log("Request body received:", {
      organizationId,
      newQuantity,
      effectiveDate,
      cancelAtRenewal,
    });

    // Validate inputs
    if (!organizationId) {
      console.error("Missing organizationId");
      return new Response(
        JSON.stringify({
          error: "Missing required field: organizationId",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (newQuantity === undefined) {
      console.error("Missing newQuantity");
      return new Response(
        JSON.stringify({
          error: "Missing required field: newQuantity",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!effectiveDate) {
      console.error("Missing effectiveDate");
      return new Response(
        JSON.stringify({
          error: "Missing required field: effectiveDate",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (newQuantity < 0 || newQuantity > 200) {
      console.error(`Invalid quantity: ${newQuantity}`);
      return new Response(
        JSON.stringify({
          error: "New quantity must be between 0 and 200",
          received: newQuantity,
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify user is an admin of the organization
    const { data: membership, error: membershipError } = await supabaseClient
      .from("organization_members")
      .select("role, status")
      .eq("user_id", user.id)
      .eq("organization_id", organizationId)
      .eq("status", "active")
      .single();

    if (membershipError || !membership || membership.role !== "admin") {
      return new Response(
        JSON.stringify({
          error: "Only organization admins can schedule license changes",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Get current license record
    const { data: license, error: licenseError } = await supabaseClient
      .from("organization_licenses")
      .select("*")
      .eq("organization_id", organizationId)
      .single();

    if (licenseError || !license) {
      return new Response(
        JSON.stringify({ error: "License not found for this organization" }),
        {
          status: 404,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Verify that we have an active subscription
    if (!license.subscription_id) {
      console.error("No subscription_id found on license:", license.id);
      return new Response(
        JSON.stringify({
          error: "No active subscription found for this license",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Check if new quantity equals current total (no change)
    console.log(
      `License total_licenses: ${license.total_licenses}, requested newQuantity: ${newQuantity}, cancelAtRenewal: ${cancelAtRenewal}`,
    );
    if (newQuantity === license.total_licenses && !cancelAtRenewal) {
      console.error(
        `No change: newQuantity (${newQuantity}) equals current total_licenses (${license.total_licenses})`,
      );
      return new Response(
        JSON.stringify({
          error: "New quantity is the same as current total. No change needed.",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Determine the scheduled change note
    const userName = user.user_metadata?.name || user.email;
    const changeType = cancelAtRenewal
      ? "Scheduled cancellation"
      : newQuantity < license.total_licenses
        ? `Reduced from ${license.total_licenses} to ${newQuantity}`
        : `Increased from ${license.total_licenses} to ${newQuantity}`;

    const note = `${changeType} by ${userName} on ${new Date().toISOString().split("T")[0]}`;

    // Update the license record with scheduled change
    const { data: updatedLicense, error: updateError } = await supabaseClient
      .from("organization_licenses")
      .update({
        scheduled_total_licenses: newQuantity,
        scheduled_change_at: effectiveDate,
        scheduled_change_note: note,
        updated_at: new Date().toISOString(),
      })
      .eq("id", license.id)
      .select()
      .single();

    if (updateError) {
      console.error("Failed to schedule license change:", updateError);
      return new Response(
        JSON.stringify({
          error: "Failed to schedule license change",
          details: updateError.message,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `Successfully scheduled license change for organization ${organizationId}: ${changeType}`,
    );

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        message: cancelAtRenewal
          ? "Subscription cancellation scheduled successfully"
          : `License change to ${newQuantity} scheduled successfully`,
        scheduledQuantity: newQuantity,
        effectiveDate: effectiveDate,
        currentQuantity: license.total_licenses,
        usedLicenses: license.used_licenses,
        note: note,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in schedule-license-change function:", error);
    return new Response(
      JSON.stringify({ error: error.message || "Internal server error" }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

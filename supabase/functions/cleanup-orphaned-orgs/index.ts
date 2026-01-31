import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.0";

/**
 * Cleanup Orphaned Personal Trial Organizations
 *
 * This function finds and deletes personal trial organizations that no longer
 * have any users associated with them. This can happen if:
 * - A user was moved to another organization but the personal org wasn't deleted
 * - A user was deleted but their personal trial org remained
 *
 * Run this periodically as a scheduled function or manually via a cron job.
 *
 * Usage:
 *   POST /cleanup-orphaned-orgs
 *   Authorization: Bearer <service_role_key>  (for security)
 */

serve(async (req) => {
  try {
    // Verify authorization (service role key for security)
    const authHeader = req.headers.get("authorization");
    const expectedKey =
      Deno.env.get("CLEANUP_SECRET_KEY") ||
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

    if (!authHeader || !expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    const token = authHeader.replace("Bearer ", "");
    if (token !== expectedKey) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        status: 401,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Initialize Supabase admin client
    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? ""
    );

    console.log("Starting cleanup of orphaned personal trial organizations...");

    // Find personal trial orgs with no active members
    // Use a NOT EXISTS subquery to find orgs with no active organization_members
    const { data: orphanedOrgs, error: fetchError } = await supabaseAdmin
      .from("organizations")
      .select("id, name, created_at")
      .eq("is_personal_trial_org", true);

    if (fetchError) {
      console.error("Error fetching organizations:", fetchError);
      throw fetchError;
    }

    if (!orphanedOrgs || orphanedOrgs.length === 0) {
      console.log("No personal trial orgs found");
      return new Response(
        JSON.stringify({
          success: true,
          orphaned_orgs_found: 0,
          orphaned_orgs_deleted: 0,
          deleted_orgs: [],
          failed_deletions: [],
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        }
      );
    }

    console.log(
      `Found ${orphanedOrgs.length} personal trial orgs, checking for active members...`
    );

    // Check each org for active members
    const orgsToDelete: any[] = [];
    for (const org of orphanedOrgs) {
      const { data: members, error: memberError } = await supabaseAdmin
        .from("organization_members")
        .select("id")
        .eq("organization_id", org.id)
        .eq("status", "active")
        .limit(1);

      if (memberError) {
        console.error(`Error checking members for org ${org.id}:`, memberError);
        continue;
      }

      // If no active members, mark for deletion
      if (!members || members.length === 0) {
        orgsToDelete.push(org);
      }
    }

    console.log(
      `Found ${orgsToDelete.length} orphaned personal trial orgs to clean up`
    );

    let deletedCount = 0;
    const deletedOrgs: any[] = [];
    const failedDeletions: any[] = [];

    for (const org of orgsToDelete) {
      console.log(`Attempting to delete org: ${org.name} (${org.id})`);

      const { error: deleteError } = await supabaseAdmin
        .from("organizations")
        .delete()
        .eq("id", org.id)
        .eq("is_personal_trial_org", true); // Double safety check

      if (deleteError) {
        console.error(`Failed to delete org ${org.id}:`, deleteError);
        failedDeletions.push({
          org_id: org.id,
          org_name: org.name,
          error: deleteError.message,
        });
      } else {
        deletedCount++;
        deletedOrgs.push({
          org_id: org.id,
          org_name: org.name,
          created_at: org.created_at,
        });
        console.log(
          `Successfully deleted orphaned org: ${org.name} (${org.id})`
        );
      }
    }

    console.log(
      `Cleanup complete. Deleted ${deletedCount} of ${orgsToDelete.length} orphaned orgs`
    );

    return new Response(
      JSON.stringify({
        success: true,
        orphaned_orgs_found: orgsToDelete.length,
        orphaned_orgs_deleted: deletedCount,
        deleted_orgs: deletedOrgs,
        failed_deletions: failedDeletions,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error cleaning up orphaned orgs:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      }
    );
  }
});

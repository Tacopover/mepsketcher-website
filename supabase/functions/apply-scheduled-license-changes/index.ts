import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

/**
 * Apply Scheduled License Changes Edge Function
 * Runs daily via cron job to apply scheduled license reductions/cancellations
 *
 * Schedule: Run daily at 2 AM UTC
 * Cron: 0 2 * * *
 *
 * This function:
 * 1. Finds licenses with scheduled changes that are due (scheduled_change_at <= now)
 * 2. Updates Paddle subscription quantities (or cancels if scheduled to 0)
 * 3. Updates database with new license counts
 * 4. Handles member unassignment if needed
 * 5. Clears scheduling fields
 */

// Paddle API configuration
const PADDLE_API_URL =
  Deno.env.get("PADDLE_ENVIRONMENT") === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

const PADDLE_API_KEY = Deno.env.get("PADDLE_API_KEY");

interface ScheduledChange {
  id: string;
  organization_id: string;
  total_licenses: number;
  used_licenses: number;
  scheduled_total_licenses: number;
  scheduled_change_at: string;
  scheduled_change_note: string;
  subscription_id: string;
  expires_at: string;
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    console.log("Starting scheduled license changes application...");

    // Find all licenses with scheduled changes that are due
    const { data: scheduledLicenses, error: queryError } = await supabase
      .from("organization_licenses")
      .select("*")
      .not("scheduled_total_licenses", "is", null)
      .lte("scheduled_change_at", new Date().toISOString())
      .order("scheduled_change_at", { ascending: true });

    if (queryError) {
      console.error("Error querying scheduled license changes:", queryError);
      throw queryError;
    }

    if (!scheduledLicenses || scheduledLicenses.length === 0) {
      console.log("No scheduled license changes due at this time");
      return new Response(
        JSON.stringify({
          success: true,
          changes_applied: 0,
          message: "No scheduled changes due",
          timestamp: new Date().toISOString(),
        }),
        {
          status: 200,
          headers: { "Content-Type": "application/json" },
        },
      );
    }

    console.log(
      `Found ${scheduledLicenses.length} scheduled license change(s) to apply`,
    );

    let successCount = 0;
    let failureCount = 0;
    const results = [];

    for (const license of scheduledLicenses as ScheduledChange[]) {
      try {
        const result = await applyScheduledChange(supabase, license);
        results.push(result);
        if (result.success) {
          successCount++;
        } else {
          failureCount++;
        }
      } catch (error) {
        console.error(
          `Failed to apply change for license ${license.id}:`,
          error,
        );
        failureCount++;
        results.push({
          success: false,
          licenseId: license.id,
          organizationId: license.organization_id,
          error: error.message,
        });
      }
    }

    console.log(
      `Completed: ${successCount} successful, ${failureCount} failed`,
    );

    return new Response(
      JSON.stringify({
        success: true,
        changes_applied: successCount,
        failures: failureCount,
        results: results,
        timestamp: new Date().toISOString(),
      }),
      {
        status: 200,
        headers: { "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error in apply-scheduled-license-changes function:", error);
    return new Response(
      JSON.stringify({
        success: false,
        error: error.message,
      }),
      {
        status: 500,
        headers: { "Content-Type": "application/json" },
      },
    );
  }
});

/**
 * Apply a single scheduled license change
 */
async function applyScheduledChange(
  supabase: any,
  license: ScheduledChange,
): Promise<any> {
  console.log(
    `Applying scheduled change for license ${license.id}: ${license.total_licenses} -> ${license.scheduled_total_licenses}`,
  );

  const newQuantity = license.scheduled_total_licenses;
  const isCancellation = newQuantity === 0;

  try {
    // Step 1: Update Paddle subscription
    if (isCancellation) {
      // Cancel the subscription
      await cancelPaddleSubscription(license.subscription_id);
      console.log(`Canceled Paddle subscription ${license.subscription_id}`);
    } else {
      // Update subscription quantity
      await updatePaddleSubscriptionQuantity(
        license.subscription_id,
        newQuantity,
      );
      console.log(
        `Updated Paddle subscription ${license.subscription_id} to ${newQuantity} licenses`,
      );
    }

    // Step 2: Handle member unassignment if needed
    if (newQuantity < license.used_licenses) {
      const membersToUnassign = license.used_licenses - newQuantity;
      console.log(
        `Need to unassign ${membersToUnassign} member(s) for organization ${license.organization_id}`,
      );
      await unassignExcessMembers(
        supabase,
        license.organization_id,
        membersToUnassign,
      );
    }

    // Step 3: Update database - apply scheduled change and clear scheduling fields
    const updateData: any = {
      total_licenses: newQuantity,
      used_licenses: Math.min(license.used_licenses, newQuantity), // Adjust if we unassigned members
      scheduled_total_licenses: null,
      scheduled_change_at: null,
      scheduled_change_note: null,
      updated_at: new Date().toISOString(),
    };

    // If cancellation, mark license as inactive or update status appropriately
    if (isCancellation) {
      updateData.license_type = "cancelled";
    }

    const { error: updateError } = await supabase
      .from("organization_licenses")
      .update(updateData)
      .eq("id", license.id);

    if (updateError) {
      throw new Error(
        `Failed to update license record: ${updateError.message}`,
      );
    }

    // Step 4: Log to license_renewal_history if table exists
    try {
      await supabase.from("license_renewal_history").insert({
        organization_id: license.organization_id,
        license_id: license.id,
        action: isCancellation ? "cancelled" : "quantity_reduced",
        previous_quantity: license.total_licenses,
        new_quantity: newQuantity,
        note: license.scheduled_change_note,
        created_at: new Date().toISOString(),
      });
    } catch (historyError) {
      // Non-critical error, log but don't fail
      console.warn("Failed to log to renewal history:", historyError);
    }

    console.log(
      `Successfully applied scheduled change for license ${license.id}`,
    );

    return {
      success: true,
      licenseId: license.id,
      organizationId: license.organization_id,
      previousQuantity: license.total_licenses,
      newQuantity: newQuantity,
      action: isCancellation ? "cancelled" : "reduced",
    };
  } catch (error) {
    console.error(
      `Error applying scheduled change for license ${license.id}:`,
      error,
    );

    // If Paddle update failed, don't update the database - keep the scheduled change for retry
    return {
      success: false,
      licenseId: license.id,
      organizationId: license.organization_id,
      error: error.message,
    };
  }
}

/**
 * Update Paddle subscription quantity
 */
async function updatePaddleSubscriptionQuantity(
  subscriptionId: string,
  newQuantity: number,
): Promise<void> {
  if (!PADDLE_API_KEY) {
    throw new Error("Paddle API key not configured");
  }

  // First, get the current subscription to find the price_id
  const getResponse = await fetch(
    `${PADDLE_API_URL}/subscriptions/${subscriptionId}`,
    {
      method: "GET",
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
    },
  );

  if (!getResponse.ok) {
    const errorData = await getResponse.json();
    throw new Error(
      `Failed to fetch subscription: ${JSON.stringify(errorData)}`,
    );
  }

  const subscriptionData = await getResponse.json();
  const items = subscriptionData.data.items;

  if (!items || items.length === 0) {
    throw new Error("No items found in subscription");
  }

  // Get the price_id from the first item (we only have one item per subscription)
  const priceId = items[0].price.id;

  // Update the subscription with new quantity
  const updateResponse = await fetch(
    `${PADDLE_API_URL}/subscriptions/${subscriptionId}`,
    {
      method: "PATCH",
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        items: [
          {
            price_id: priceId,
            quantity: newQuantity,
          },
        ],
        proration_billing_mode: "prorated_immediately",
      }),
    },
  );

  if (!updateResponse.ok) {
    const errorData = await updateResponse.json();
    throw new Error(
      `Failed to update subscription: ${JSON.stringify(errorData)}`,
    );
  }

  console.log(
    `Successfully updated Paddle subscription ${subscriptionId} to quantity ${newQuantity}`,
  );
}

/**
 * Cancel Paddle subscription
 */
async function cancelPaddleSubscription(subscriptionId: string): Promise<void> {
  if (!PADDLE_API_KEY) {
    throw new Error("Paddle API key not configured");
  }

  const response = await fetch(
    `${PADDLE_API_URL}/subscriptions/${subscriptionId}/cancel`,
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        effective_from: "immediately",
      }),
    },
  );

  if (!response.ok) {
    const errorData = await response.json();
    throw new Error(
      `Failed to cancel subscription: ${JSON.stringify(errorData)}`,
    );
  }

  console.log(`Successfully canceled Paddle subscription ${subscriptionId}`);
}

/**
 * Unassign licenses from members (starting with regular members, keeping admins)
 */
async function unassignExcessMembers(
  supabase: any,
  organizationId: string,
  count: number,
): Promise<void> {
  // Get members with licenses, prioritizing regular members over admins
  const { data: members, error: queryError } = await supabase
    .from("organization_members")
    .select("*")
    .eq("organization_id", organizationId)
    .eq("has_license", true)
    .eq("status", "active")
    .order("role", { ascending: false }) // Regular members first, then admins
    .limit(count);

  if (queryError) {
    throw new Error(`Failed to query members: ${queryError.message}`);
  }

  if (!members || members.length === 0) {
    console.warn(
      `No members found to unassign for organization ${organizationId}`,
    );
    return;
  }

  // Unassign licenses from these members
  const memberIds = members.map((m) => m.user_id);
  const { error: updateError } = await supabase
    .from("organization_members")
    .update({ has_license: false })
    .in("user_id", memberIds)
    .eq("organization_id", organizationId);

  if (updateError) {
    throw new Error(`Failed to unassign members: ${updateError.message}`);
  }

  console.log(
    `Unassigned ${members.length} member(s) for organization ${organizationId}`,
  );

  // TODO: Send email notifications to unassigned members
  // This would integrate with your email service
}

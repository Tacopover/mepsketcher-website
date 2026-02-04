import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

// Paddle API configuration
const PADDLE_API_URL =
  Deno.env.get("PADDLE_ENVIRONMENT") === "production"
    ? "https://api.paddle.com"
    : "https://sandbox-api.paddle.com";

const PADDLE_API_KEY = Deno.env.get("PADDLE_API_KEY");
const YEARLY_LICENSE_PRICE = 200; // Base price per license per year in USD
const PRODUCT_ID = Deno.env.get("PADDLE_PRODUCT_ID"); // Your Paddle product ID

interface AddSubscriptionItemsRequest {
  organizationId: string;
  subscriptionId: string;
  quantity: number;
}

interface SubscriptionItem {
  price_id: string;
  quantity: number;
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
    const body: AddSubscriptionItemsRequest = await req.json();
    const { organizationId, subscriptionId, quantity } = body;

    // Validate inputs
    if (!organizationId || !subscriptionId || !quantity) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (quantity < 1 || quantity > 1000) {
      return new Response(
        JSON.stringify({ error: "Quantity must be between 1 and 1000" }),
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
          error: "Only organization admins can purchase additional licenses",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    if (!PADDLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Paddle API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Step 1: Get current subscription details to find the price ID
    console.log(`Fetching subscription details for ${subscriptionId}`);

    const getSubscriptionResponse = await fetch(
      `${PADDLE_API_URL}/subscriptions/${subscriptionId}`,
      {
        method: "GET",
        headers: {
          Authorization: `Bearer ${PADDLE_API_KEY}`,
          "Content-Type": "application/json",
        },
      },
    );

    if (!getSubscriptionResponse.ok) {
      const errorData = await getSubscriptionResponse.json();
      console.error("Failed to fetch subscription:", errorData);
      return new Response(
        JSON.stringify({
          error: "Failed to fetch subscription details",
          details: errorData,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const subscriptionData = await getSubscriptionResponse.json();
    console.log(
      "Full subscription response:",
      JSON.stringify(subscriptionData, null, 2),
    );

    const currentItems = subscriptionData.data.items || [];
    console.log("Current subscription items count:", currentItems.length);
    console.log(
      "Current subscription items:",
      JSON.stringify(currentItems, null, 2),
    );

    // Step 2: Find the base license price ID from the existing items
    // We'll use the same price for additional items to keep them bundled
    let basePriceId: string | null = null;
    const itemsToUpdate: SubscriptionItem[] = [];
    let totalExistingQuantity = 0;

    for (const item of currentItems) {
      // Handle different possible structures: item.price_id or item.price.id
      const priceId = item.price_id || item.price?.id;
      const itemQuantity = item.quantity || 1;

      if (!priceId) {
        console.error("Item missing price_id:", JSON.stringify(item, null, 2));
        continue;
      }

      // Store the first price ID as base (should be the license price)
      if (!basePriceId) {
        basePriceId = priceId;
        console.log("Using base price ID:", basePriceId);
      }

      totalExistingQuantity += itemQuantity;
    }

    if (!basePriceId) {
      console.error("No price ID found in existing subscription items");
      return new Response(
        JSON.stringify({
          error: "Could not determine license price from subscription",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Step 3: Instead of adding duplicate items, increase the quantity of the existing price
    // Paddle doesn't allow multiple items with the same price_id in a subscription
    const newTotalQuantity = totalExistingQuantity + quantity;
    itemsToUpdate.push({
      price_id: basePriceId,
      quantity: newTotalQuantity,
    });

    console.log(
      `Updating subscription: existing quantity ${totalExistingQuantity} + ${quantity} new = ${newTotalQuantity} total`,
    );
    console.log("Updated items to send to Paddle:", itemsToUpdate);

    // Step 4: Update subscription with new items and proration
    // proration_billing_mode: "prorated_immediately" charges/credits right away
    // next_billed_at stays the same, so all items renew together
    const updateSubscriptionResponse = await fetch(
      `${PADDLE_API_URL}/subscriptions/${subscriptionId}`,
      {
        method: "PATCH",
        headers: {
          Authorization: `Bearer ${PADDLE_API_KEY}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          items: itemsToUpdate,
          proration_billing_mode: "prorated_immediately",
          // Note: We do NOT change next_billed_at - all items naturally share the same renewal date
        }),
      },
    );

    const updateData = await updateSubscriptionResponse.json();

    if (!updateSubscriptionResponse.ok) {
      console.error("Paddle update subscription error:", updateData);
      return new Response(
        JSON.stringify({
          error: "Failed to update subscription",
          details: updateData,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log("Subscription updated successfully:", updateData);

    // Note: We don't update the database here - let the Paddle webhook handle it
    // when subscription.updated event is received. This ensures consistency and
    // prevents race conditions or double-counting.
    console.log(
      "Paddle subscription updated. Database will be updated via webhook.",
    );

    const newTotalLicenses =
      itemsToUpdate.reduce((sum, item) => sum + item.quantity, 0) || 1;

    // Return success response
    return new Response(
      JSON.stringify({
        success: true,
        subscriptionId: subscriptionId,
        additionalLicenses: quantity,
        totalLicenses: newTotalLicenses,
        nextBilledAt: updateData.data.next_billed_at,
        message: `Successfully added ${quantity} additional license(s) to your subscription. All licenses will renew together on ${new Date(updateData.data.next_billed_at).toLocaleDateString()}.`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Error adding subscription items:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

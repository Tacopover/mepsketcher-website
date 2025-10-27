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

interface CustomPriceRequest {
  organizationId: string;
  quantity: number;
  remainingDays: number;
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
        }
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
    const body: CustomPriceRequest = await req.json();
    const { organizationId, quantity, remainingDays } = body;

    // Validate inputs
    if (!organizationId || !quantity || !remainingDays) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (quantity < 1 || quantity > 1000) {
      return new Response(
        JSON.stringify({ error: "Quantity must be between 1 and 1000" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    if (remainingDays < 1 || remainingDays > 730) {
      return new Response(
        JSON.stringify({
          error: "Remaining days must be between 1 and 730 (2 years)",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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
          error: "Only organization admins can purchase licenses",
        }),
        {
          status: 403,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Calculate pro-rated price
    const dailyRate = YEARLY_LICENSE_PRICE / 365;
    const totalPrice = dailyRate * remainingDays * quantity;
    const roundedPrice = Math.ceil(totalPrice * 100) / 100; // Round up to nearest cent

    console.log("Price calculation:", {
      yearlyPrice: YEARLY_LICENSE_PRICE,
      dailyRate,
      remainingDays,
      quantity,
      totalPrice,
      roundedPrice,
    });

    // Create custom price in Paddle
    if (!PADDLE_API_KEY) {
      return new Response(
        JSON.stringify({ error: "Paddle API key not configured" }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    // Paddle Prices API v2 - Create a custom price
    const paddleResponse = await fetch(`${PADDLE_API_URL}/prices`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${PADDLE_API_KEY}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        description: `${quantity} MepSketcher License${
          quantity > 1 ? "s" : ""
        } (${remainingDays} days remaining)`,
        name: `Additional Licenses - ${quantity}x (Pro-rated)`,
        product_id: PRODUCT_ID,
        unit_price: {
          amount: (roundedPrice * 100).toString(), // Convert to cents as string
          currency_code: "USD",
        },
        billing_cycle: null, // One-time payment
        tax_mode: "account_setting", // Use Paddle account tax settings
      }),
    });

    const paddleData = await paddleResponse.json();

    if (!paddleResponse.ok) {
      console.error("Paddle API error:", paddleData);
      return new Response(
        JSON.stringify({
          error: "Failed to create custom price",
          details: paddleData,
        }),
        {
          status: 500,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log("Custom price created:", paddleData);

    // Return the custom price ID and amount
    return new Response(
      JSON.stringify({
        success: true,
        priceId: paddleData.data.id,
        amount: roundedPrice,
        quantity: quantity,
        remainingDays: remainingDays,
        description: `${quantity} license${
          quantity > 1 ? "s" : ""
        } for ${remainingDays} days`,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error creating custom price:", error);
    return new Response(
      JSON.stringify({
        error: "Internal server error",
        message: error.message,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

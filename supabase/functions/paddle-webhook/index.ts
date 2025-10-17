import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Helper to verify Paddle webhook signature
async function verifyPaddleSignature(
  body: string,
  signature: string,
  secret: string
): Promise<boolean> {
  const encoder = new TextEncoder();
  const keyData = encoder.encode(secret);

  const key = await crypto.subtle.importKey(
    "raw",
    keyData,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  const signatureData = await crypto.subtle.sign(
    "HMAC",
    key,
    encoder.encode(body)
  );

  const calculatedSignature = Array.from(new Uint8Array(signatureData))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  return calculatedSignature === signature;
}

Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paddleWebhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET")!;

    const bodyText = await req.text();

    // Verify Paddle signature
    const signature = req.headers.get("paddle-signature");
    if (!signature) {
      console.error("No signature provided");
      return new Response("Unauthorized", { status: 401 });
    }

    const isValid = await verifyPaddleSignature(
      bodyText,
      signature,
      paddleWebhookSecret
    );
    if (!isValid) {
      console.error("Invalid signature");
      return new Response("Invalid signature", { status: 401 });
    }

    const event = JSON.parse(bodyText);
    console.log("Received Paddle event:", event.event_type);

    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Handle transaction.completed event
    if (event.event_type === "transaction.completed") {
      const { data: transactionData } = event;
      const {
        items,
        custom_data,
        customer,
        id: transactionId,
      } = transactionData;

      const quantity = items[0]?.quantity || 1;
      const userId = custom_data?.userId;
      const userEmail = custom_data?.email || customer?.email;

      if (!userId) {
        console.error("No userId in custom_data");
        return new Response("Missing userId", { status: 400 });
      }

      console.log(
        `Processing purchase: ${quantity} license(s) for user ${userId}`
      );

      // 1. Check if organization already exists for this user
      let organizationId: string;

      const { data: existingMember } = await supabase
        .from("organization_members")
        .select("organization_id")
        .eq("user_id", userId)
        .single();

      if (existingMember) {
        organizationId = existingMember.organization_id;
        console.log("Using existing organization:", organizationId);
      } else {
        // Create new organization
        const { data: newOrg, error: orgError } = await supabase
          .from("organizations")
          .insert({
            name: `${userEmail}'s Organization`,
            owner_id: userId,
          })
          .select()
          .single();

        if (orgError) {
          console.error("Error creating organization:", orgError);
          throw orgError;
        }

        organizationId = newOrg.id;
        console.log("Created new organization:", organizationId);

        // Add user as organization owner
        const { error: memberError } = await supabase
          .from("organization_members")
          .insert({
            user_id: userId,
            organization_id: organizationId,
            role: "owner",
          });

        if (memberError) {
          console.error("Error adding organization member:", memberError);
          throw memberError;
        }
      }

      // 2. Check if organization_licenses entry already exists
      const { data: existingLicense } = await supabase
        .from("organization_licenses")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (existingLicense) {
        // Update existing license entry - add more licenses
        const { data: updatedLicense, error: updateError } = await supabase
          .from("organization_licenses")
          .update({
            total_licenses: existingLicense.total_licenses + quantity,
            paddle_id: transactionId,
            updated_at: new Date().toISOString(),
            expires_at: new Date(
              Date.now() + 365 * 24 * 60 * 60 * 1000
            ).toISOString(),
          })
          .eq("id", existingLicense.id)
          .select()
          .single();

        if (updateError) {
          console.error("Error updating licenses:", updateError);
          throw updateError;
        }

        console.log(
          `Updated license: added ${quantity} licenses, total now: ${updatedLicense.total_licenses}`
        );

        return new Response(
          JSON.stringify({
            success: true,
            licenses_added: quantity,
            total_licenses: updatedLicense.total_licenses,
            organization_id: organizationId,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      } else {
        // Create new license entry
        const { data: newLicense, error: licenseError } = await supabase
          .from("organization_licenses")
          .insert({
            organization_id: organizationId,
            total_licenses: quantity,
            used_licenses: 0,
            license_type: "standard",
            paddle_id: transactionId,
            expires_at: new Date(
              Date.now() + 365 * 24 * 60 * 60 * 1000
            ).toISOString(),
          })
          .select()
          .single();

        if (licenseError) {
          console.error("Error creating license:", licenseError);
          throw licenseError;
        }

        console.log(`Created license entry with ${quantity} licenses`);

        return new Response(
          JSON.stringify({
            success: true,
            licenses_created: quantity,
            organization_id: organizationId,
          }),
          {
            status: 200,
            headers: { "Content-Type": "application/json" },
          }
        );
      }
    }

    console.log("Event type not handled:", event.event_type);
    return new Response("OK", { status: 200 });
  } catch (error) {
    console.error("Error processing webhook:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error";
    return new Response(JSON.stringify({ error: errorMessage }), {
      status: 500,
      headers: { "Content-Type": "application/json" },
    });
  }
});

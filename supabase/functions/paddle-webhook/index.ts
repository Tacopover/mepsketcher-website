import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// Paddle sends signature in format: ts=timestamp;h1=signature
// We need to extract and verify it properly
function extractPaddleSignature(signatureHeader: string | null): {
  timestamp: string;
  signature: string;
} | null {
  if (!signatureHeader) return null;

  const parts = signatureHeader.split(";");
  const tsMatch = parts.find((p) => p.startsWith("ts="));
  const h1Match = parts.find((p) => p.startsWith("h1="));

  if (!tsMatch || !h1Match) return null;

  return {
    timestamp: tsMatch.substring(3),
    signature: h1Match.substring(3),
  };
}

async function verifyPaddleSignature(
  body: string,
  timestamp: string,
  signature: string,
  secret: string
): Promise<boolean> {
  // Paddle signature format: ts + : + body
  const payload = timestamp + ":" + body;

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
    encoder.encode(payload)
  );

  const calculatedSignature = Array.from(new Uint8Array(signatureData))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");

  // Use timing-safe comparison to prevent timing attacks
  if (calculatedSignature.length !== signature.length) {
    return false;
  }
  
  // Constant-time comparison
  const calculatedBuffer = new TextEncoder().encode(calculatedSignature);
  const signatureBuffer = new TextEncoder().encode(signature);
  
  return timingSafeEqual(calculatedBuffer.buffer, signatureBuffer.buffer);
}

/**
 * Constant-time comparison to prevent timing attacks
 */
function timingSafeEqual(a: ArrayBuffer, b: ArrayBuffer): boolean {
  if (a.byteLength !== b.byteLength) {
    return false;
  }
  const view1 = new DataView(a);
  const view2 = new DataView(b);
  let diff = 0;
  for (let i = 0; i < a.byteLength; i++) {
    diff |= view1.getUint8(i) ^ view2.getUint8(i);
  }
  return diff === 0;
}Deno.serve(async (req) => {
  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
    const paddleWebhookSecret = Deno.env.get("PADDLE_WEBHOOK_SECRET")!;

    const bodyText = await req.text();

    // Verify Paddle signature
    // Try both header name variations
    const signatureHeader =
      req.headers.get("paddle-signature") ||
      req.headers.get("Paddle-Signature");

    if (!signatureHeader) {
      console.error("No Paddle signature header found");
      console.log(
        "Available headers:",
        Object.fromEntries(req.headers.entries())
      );
      return new Response("Unauthorized", { status: 401 });
    }

    const signatureData = extractPaddleSignature(signatureHeader);
    if (!signatureData) {
      console.error("Invalid signature format:", signatureHeader);
      return new Response("Invalid signature format", { status: 401 });
    }

    const isValid = await verifyPaddleSignature(
      bodyText,
      signatureData.timestamp,
      signatureData.signature,
      paddleWebhookSecret
    );

    if (!isValid) {
      console.error("Invalid signature verification failed");
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
      const userId = custom_data?.userId || custom_data?.user_id;
      const organizationIdFromCustomData =
        custom_data?.organizationId || custom_data?.organization_id;
      const userEmail = custom_data?.email || customer?.email;

      if (!userId) {
        console.error("No userId in custom_data");
        return new Response("Missing userId", { status: 400 });
      }

      console.log(
        `Processing purchase: ${quantity} license(s) for user ${userId}`
      );

      // 1. Determine organization ID (from custom_data or lookup)
      let organizationId: string | null = organizationIdFromCustomData || null;
      let oldPersonalOrgId: string | null = null; // Track personal trial org for cleanup

      if (!organizationId) {
        // No organization ID provided, try to find existing membership
        console.log(
          "No organizationId in custom_data, checking for existing membership"
        );
        const { data: existingMember } = await supabase
          .from("organization_members")
          .select("organization_id")
          .eq("user_id", userId)
          .maybeSingle();

        if (existingMember) {
          organizationId = existingMember.organization_id;
          console.log(
            "Found existing organization from membership:",
            organizationId
          );
        }
      } else {
        console.log("Using organization from custom_data:", organizationId);
      }

      // 2. If still no organization, check for personal trial org
      if (!organizationId) {
        console.log("No organization found, checking for personal trial org");

        // Check if user has a personal trial organization via organization_members
        const { data: existingMemberships } = await supabase
          .from("organization_members")
          .select(
            "organization_id, organizations(id, name, is_personal_trial_org)"
          )
          .eq("user_id", userId)
          .eq("role", "owner")
          .eq("status", "active");

        if (existingMemberships && existingMemberships.length > 0) {
          // Find personal trial org
          const personalTrialMembership = existingMemberships.find(
            (m: any) => m.organizations?.is_personal_trial_org === true
          );

          if (
            personalTrialMembership &&
            personalTrialMembership.organizations
          ) {
            console.log(
              "Found personal trial org, will replace with real org:",
              personalTrialMembership.organizations.id
            );
            oldPersonalOrgId = personalTrialMembership.organizations.id;
          }
        }

        // Get organization name from custom_data or use default
        const organizationName =
          custom_data?.organizationName ||
          custom_data?.organization_name ||
          `${userEmail}'s Organization`;

        console.log("Creating new organization:", organizationName);
        const { data: newOrg, error: orgError } = await supabase
          .from("organizations")
          .insert({
            name: organizationName,
            owner_id: userId,
            is_trial: false,
            is_personal_trial_org: false, // This is a real organization
          })
          .select()
          .single();

        if (orgError) {
          console.error("Error creating organization:", orgError);
          throw orgError;
        }

        organizationId = newOrg.id;
        console.log("Created new organization:", organizationId);

        // If user had a personal trial org, remove them from it
        if (oldPersonalOrgId) {
          console.log(
            "Removing user from personal trial org and marking it for cleanup"
          );
          // Update their membership status to inactive in the old org
          const { error: updateMemberError } = await supabase
            .from("organization_members")
            .update({ status: "inactive" })
            .eq("user_id", userId)
            .eq("organization_id", oldPersonalOrgId);

          if (updateMemberError) {
            console.error("Error updating old membership:", updateMemberError);
            // Non-fatal, continue - cleanup function will handle orphaned orgs
          }
        }
      }

      // 3. CRITICAL: Always ensure user is in organization_members
      console.log("Checking if user is in organization_members");
      const { data: membershipCheck, error: memberCheckError } = await supabase
        .from("organization_members")
        .select("user_id, role, status")
        .eq("user_id", userId)
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (memberCheckError && memberCheckError.code !== "PGRST116") {
        console.error("Error checking membership:", memberCheckError);
        // Don't throw - continue with license operations
      }

      if (!membershipCheck) {
        console.log(
          "User not in organization_members, attempting to add as admin"
        );

        // First, try to insert the new membership
        const { error: memberError } = await supabase
          .from("organization_members")
          .insert({
            user_id: userId,
            organization_id: organizationId,
            role: "admin",
            status: "active",
            email: userEmail,
            has_license: true,
            accepted_at: new Date().toISOString(),
          });

        if (memberError) {
          // Check if it's a duplicate key error (user already exists)
          if (memberError.code === "23505") {
            console.log(
              "User already in organization_members (duplicate key), updating instead"
            );

            // Update the existing record
            const { error: updateError } = await supabase
              .from("organization_members")
              .update({
                role: "admin",
                status: "active",
                has_license: true,
                accepted_at: new Date().toISOString(),
              })
              .eq("user_id", userId)
              .eq("organization_id", organizationId);

            if (updateError) {
              console.error("Error updating existing membership:", updateError);
              // Don't throw - this is non-fatal for license operations
            } else {
              console.log("Successfully updated existing membership");
            }
          } else {
            console.error(
              "Error adding user to organization_members:",
              memberError
            );
            // Don't throw - log and continue with license operations
            console.log(
              "Continuing with license operations despite membership error"
            );
          }
        } else {
          console.log("Successfully added user to organization_members");
        }
      } else {
        console.log(
          `User already in organization_members with role: ${membershipCheck.role}`
        );

        // Update has_license flag if needed
        if (!membershipCheck.has_license) {
          console.log("Updating has_license flag for existing member");
          const { error: updateLicenseError } = await supabase
            .from("organization_members")
            .update({ has_license: true })
            .eq("user_id", userId)
            .eq("organization_id", organizationId);

          if (updateLicenseError) {
            console.error("Error updating has_license:", updateLicenseError);
            // Non-fatal
          }
        }
      }

      // 4. Check if organization_licenses entry already exists
      const { data: existingLicense } = await supabase
        .from("organization_licenses")
        .select("*")
        .eq("organization_id", organizationId)
        .maybeSingle();

      if (existingLicense) {
        // Update existing license entry
        // Check if this is a prorated purchase (adding to existing license period)
        const isProrated = custom_data?.prorated === true;

        let newExpiryDate;
        if (isProrated) {
          // For prorated purchases, keep the existing expiry date
          // (user bought additional licenses for the same period)
          newExpiryDate = existingLicense.expires_at;
          console.log(
            `Prorated purchase: keeping existing expiry date ${newExpiryDate}`
          );
        } else {
          // For regular purchases, extend by 1 year from now
          newExpiryDate = new Date(
            Date.now() + 365 * 24 * 60 * 60 * 1000
          ).toISOString();
          console.log(
            `Standard purchase: setting new expiry date ${newExpiryDate}`
          );
        }

        const { data: updatedLicense, error: updateError } = await supabase
          .from("organization_licenses")
          .update({
            total_licenses: existingLicense.total_licenses + quantity,
            paddle_id: transactionId,
            updated_at: new Date().toISOString(),
            expires_at: newExpiryDate,
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
            prorated: isProrated,
            expires_at: newExpiryDate,
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
            used_licenses: 1,
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

        // Update organization to mark as paid
        const { error: orgUpdateError } = await supabase
          .from("organizations")
          .update({ is_trial: false })
          .eq("id", organizationId);

        if (orgUpdateError) {
          console.error(
            "Error updating organization trial status:",
            orgUpdateError
          );
        } else {
          console.log("Organization marked as paid (trial ended)");
        }

        // Delete old personal trial organization if it exists
        if (oldPersonalOrgId) {
          console.log(
            "Deleting old personal trial organization:",
            oldPersonalOrgId
          );
          const { error: deleteOrgError } = await supabase
            .from("organizations")
            .delete()
            .eq("id", oldPersonalOrgId)
            .eq("is_personal_trial_org", true); // Safety check

          if (deleteOrgError) {
            console.error("Error deleting personal trial org:", deleteOrgError);
            // Non-fatal - org will be orphaned but user is still successfully set up
          } else {
            console.log("Successfully deleted personal trial org");
          }
        }

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

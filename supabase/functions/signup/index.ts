import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface SignUpRequest {
  email: string;
  password: string;
  name: string;
  organizationName?: string;
  invitationToken?: string;
}

interface SignUpResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string;
    emailConfirmed: boolean;
  };
  requiresEmailConfirmation?: boolean;
  message?: string;
  error?: string;
  joinedOrganization?: boolean;
  organizationId?: string;
}

/**
 * Hash token using SHA-256 (same algorithm as send-invitation-email)
 */
async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hashBuffer = await crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

/**
 * Validate password strength (minimum 8 characters)
 */
function isValidPassword(password: string): boolean {
  return password && password.length >= 8;
}

Deno.serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  // Only allow POST requests
  if (req.method !== "POST") {
    return new Response(JSON.stringify({ error: "Method not allowed" }), {
      status: 405,
      headers: { ...corsHeaders, "Content-Type": "application/json" },
    });
  }

  try {
    const supabaseUrl = Deno.env.get("SUPABASE_URL")!;
    const supabaseServiceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

    // Create Supabase client with service role key (bypasses RLS)
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);

    // Parse request body
    const requestBody: SignUpRequest = await req.json();
    const { email, password, name, organizationName, invitationToken } =
      requestBody;

    // Validate required fields (organizationName is optional, will be auto-generated)
    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email, password, and name are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate email format
    if (!isValidEmail(email)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Invalid email format",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    // Validate password strength
    if (!isValidPassword(password)) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Password must be at least 8 characters long",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    console.log(`Processing signup for: ${email}`);

    // Check for invitation token BEFORE creating auth user
    let pendingInvitation = null;
    if (invitationToken) {
      console.log("Checking invitation token");

      try {
        const tokenHash = await hashToken(invitationToken);

        const { data: invitation, error: inviteError } = await supabaseAdmin
          .from("organization_members")
          .select("*")
          .eq("invite_token_hash", tokenHash)
          .eq("status", "pending")
          .eq("email", email)
          .maybeSingle();

        if (invitation && !inviteError) {
          // Check if not expired
          const expiresAt = new Date(invitation.invitation_expires_at);
          if (expiresAt > new Date()) {
            console.log("Valid invitation found");
            pendingInvitation = invitation;
          } else {
            console.log("Invitation has expired");
          }
        } else {
          console.log("No valid invitation found for this token and email");
        }
      } catch (error) {
        console.error("Error checking invitation:", error);
        // Continue with normal signup if invitation check fails
      }
    }

    // Step 1: Create auth user using admin.createUser (no automatic email)
    // We'll send a custom verification email via send-verification-email function
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.admin.createUser({
        email: email,
        password: password,
        email_confirm: false, // Don't auto-confirm, we'll use custom verification
        user_metadata: {
          name: name,
        },
      });

    if (authError || !authData.user) {
      console.error("Auth user creation failed:", authError);
      return new Response(
        JSON.stringify({
          success: false,
          error: authError?.message || "Failed to create user account",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userId = authData.user.id;

    console.log(`User created: ${userId}`);

    // Step 2: For invitation-based signups, create everything immediately
    // For regular signups, always require email verification via our custom flow
    if (pendingInvitation) {
      // User is accepting an invitation - confirm email and create everything immediately
      console.log(
        "Invitation-based signup - creating organization immediately",
      );

      try {
        // 2a. Create user profile
        const { error: profileError } = await supabaseAdmin
          .from("user_profiles")
          .insert({
            id: userId,
            email: email,
            name: name,
          });

        if (profileError) {
          console.error("Failed to create user profile:", profileError);
          throw new Error(`Profile creation failed: ${profileError.message}`);
        }

        console.log("User profile created");

        // 2b. Check if user is accepting an invitation
        if (pendingInvitation) {
          console.log("Processing invitation acceptance");

          try {
            // Accept invitation - update to active and assign license
            const { error: updateError } = await supabaseAdmin
              .from("organization_members")
              .update({
                user_id: userId,
                status: "active",
                has_license: true, // Assign license to new member
                accepted_at: new Date().toISOString(),
                invite_token_hash: null, // Clear token hash
                invite_token_sent_at: null,
                invitation_expires_at: null,
              })
              .eq("id", pendingInvitation.id);

            if (updateError) {
              console.error("Error accepting invitation:", updateError);
              throw new Error(
                `Failed to accept invitation: ${updateError.message}`,
              );
            }

            console.log(
              "Invitation accepted successfully and license assigned",
            );

            // Increment used licenses
            const { data: license } = await supabaseAdmin
              .from("organization_licenses")
              .select("used_licenses")
              .eq("organization_id", pendingInvitation.organization_id)
              .single();

            if (license) {
              await supabaseAdmin
                .from("organization_licenses")
                .update({
                  used_licenses: license.used_licenses + 1,
                  updated_at: new Date().toISOString(),
                })
                .eq("organization_id", pendingInvitation.organization_id);

              console.log("License count incremented");
            }

            // Get organization name for response message
            const { data: org } = await supabaseAdmin
              .from("organizations")
              .select("name")
              .eq("id", pendingInvitation.organization_id)
              .single();

            // Return success - user joined existing org via invitation
            return new Response(
              JSON.stringify({
                success: true,
                user: {
                  id: userId,
                  email: email,
                  name: name,
                  emailConfirmed: true,
                },
                requiresEmailConfirmation: false,
                message: `Account created! You've joined ${
                  org?.name || "the organization"
                }.`,
                joinedOrganization: true,
                organizationId: pendingInvitation.organization_id,
              } as SignUpResponse),
              {
                status: 200,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          } catch (inviteError) {
            console.error("Error processing invitation:", inviteError);
            return new Response(
              JSON.stringify({
                success: false,
                error: "Failed to process invitation. Please try again.",
              }),
              {
                status: 500,
                headers: { ...corsHeaders, "Content-Type": "application/json" },
              },
            );
          }
        }

        // If no invitation - this shouldn't happen in this branch
        // Fall through to regular signup below
      } catch (setupError) {
        console.error("Invitation setup error:", setupError);
        // Fall through to regular signup
      }
    }

    // Step 3: Regular signup (no invitation) - always require email verification
    console.log(
      "Regular signup - creating pending organization and sending verification email",
    );

    const orgName = organizationName?.trim() || `${name}'s Organization`;

    try {
      const { error: pendingError } = await supabaseAdmin
        .from("pending_organizations")
        .insert({
          user_id: userId,
          user_email: email,
          user_name: name,
          organization_name: orgName,
        });

      if (pendingError) {
        console.error("Failed to create pending organization:", pendingError);
        // Don't fail the signup, just log the error
      } else {
        console.log("Pending organization created");
      }
    } catch (pendingError) {
      console.error("Pending organization error:", pendingError);
      // Don't fail the signup
    }

    // Send custom verification email via our edge function
    console.log("Calling send-verification-email edge function...");
    try {
      const verificationResponse = await fetch(
        `${supabaseUrl}/functions/v1/send-verification-email`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({
            email: email,
            user_id: userId,
            user_name: name,
          }),
        },
      );

      if (!verificationResponse.ok) {
        const errorText = await verificationResponse.text();
        console.error("Failed to send verification email:", errorText);
        // Don't fail the signup, but log the error
      } else {
        console.log("Verification email sent successfully");
      }
    } catch (emailError) {
      console.error("Error sending verification email:", emailError);
      // Don't fail the signup
    }

    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userId,
          email: email,
          name: name,
          emailConfirmed: false,
        },
        requiresEmailConfirmation: true,
        message:
          "Account created! Please check your email to confirm your account before signing in.",
      } as SignUpResponse),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Signup error:", error);
    const errorMessage =
      error instanceof Error ? error.message : "Unknown error occurred";

    return new Response(
      JSON.stringify({
        success: false,
        error: errorMessage,
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  }
});

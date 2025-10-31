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

    // Validate required fields
    if (!email || !password || !name) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email, password, and name are required",
        }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
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

    // Step 1: Create auth user using signUp (triggers confirmation email)
    const { data: authData, error: authError } =
      await supabaseAdmin.auth.signUp({
        email: email,
        password: password,
        options: {
          data: {
            name: name,
          },
          emailRedirectTo: `${
            Deno.env.get("SITE_URL") || "https://mepsketcher.com"
          }/dashboard.html`,
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
        }
      );
    }

    const userId = authData.user.id;
    const emailConfirmed = authData.user.email_confirmed_at !== null;

    console.log(`User created: ${userId}, Email confirmed: ${emailConfirmed}`);

    // Step 2: Handle organization setup based on email confirmation status
    if (emailConfirmed) {
      // Email is confirmed - create everything immediately
      console.log("Email confirmed - creating organization immediately");

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
                `Failed to accept invitation: ${updateError.message}`
              );
            }

            console.log(
              "Invitation accepted successfully and license assigned"
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

            // Return success - user joined existing org
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
              }
            );
          } catch (inviteError) {
            console.error("Error processing invitation:", inviteError);
            // Continue with normal organization creation if invitation fails
          }
        }

        // 2c. Handle organization (no invitation or invitation failed)
        const orgName =
          organizationName?.trim() || `${email.split("@")[0]}'s Organization`;

        // Check if organization already exists
        const { data: existingOrgs, error: searchError } = await supabaseAdmin
          .from("organizations")
          .select("*")
          .eq("name", orgName);

        if (searchError) {
          console.error("Failed to search organizations:", searchError);
          throw new Error(`Organization search failed: ${searchError.message}`);
        }

        let organizationId: string;

        if (existingOrgs && existingOrgs.length > 0) {
          // Organization exists - add user as member
          organizationId = existingOrgs[0].id;
          console.log(`Joining existing organization: ${organizationId}`);

          const { error: memberError } = await supabaseAdmin
            .from("organization_members")
            .insert({
              organization_id: organizationId,
              user_id: userId,
              role: "member",
              status: "active",
              has_license: true, // Assign license to new member
              accepted_at: new Date().toISOString(),
            });

          if (memberError) {
            console.error("Failed to add user to organization:", memberError);
            throw new Error(
              `Failed to join organization: ${memberError.message}`
            );
          }

          console.log("User added to existing organization");
        } else {
          // Create new organization
          const { data: newOrg, error: orgError } = await supabaseAdmin
            .from("organizations")
            .insert({
              name: orgName,
              owner_id: userId,
            })
            .select()
            .single();

          if (orgError || !newOrg) {
            console.error("Failed to create organization:", orgError);
            throw new Error(
              `Organization creation failed: ${orgError?.message}`
            );
          }

          organizationId = newOrg.id;
          console.log(`Created new organization: ${organizationId}`);

          // Add user as admin
          const { error: memberError } = await supabaseAdmin
            .from("organization_members")
            .insert({
              organization_id: organizationId,
              user_id: userId,
              role: "owner",
              status: "active",
              has_license: true, // Assign license to organization owner
              accepted_at: new Date().toISOString(),
            });

          if (memberError) {
            console.error("Failed to add user as owner:", memberError);
            throw new Error(
              `Failed to add user as owner: ${memberError.message}`
            );
          }

          console.log("User added as organization owner");
        }

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
            message: "Account created successfully! You can now sign in.",
          } as SignUpResponse),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      } catch (setupError) {
        console.error("Organization setup error:", setupError);
        return new Response(
          JSON.stringify({
            success: true, // User was created
            user: {
              id: userId,
              email: email,
              name: name,
              emailConfirmed: true,
            },
            requiresEmailConfirmation: false,
            message:
              "Account created but organization setup incomplete. Please contact support.",
          } as SignUpResponse),
          {
            status: 200,
            headers: { ...corsHeaders, "Content-Type": "application/json" },
          }
        );
      }
    } else {
      // Email NOT confirmed - create pending organization
      console.log("Email not confirmed - creating pending organization");

      const orgName =
        organizationName?.trim() || `${email.split("@")[0]}'s Organization`;

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
        }
      );
    }
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
      }
    );
  }
});

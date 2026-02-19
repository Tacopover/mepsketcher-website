import "jsr:@supabase/functions-js/edge-runtime.d.ts";
import { createClient } from "jsr:@supabase/supabase-js@2";

// CORS headers
const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

/**
 * Validate email format
 */
function isValidEmail(email: string): boolean {
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return emailRegex.test(email);
}

interface SignInRequest {
  email: string;
  password: string;
}

interface SignInResponse {
  success: boolean;
  user?: {
    id: string;
    email: string;
    name: string | null;
    emailConfirmed: boolean;
  };
  organization?: {
    id: string;
    name: string;
    isTrial: boolean;
    trialExpiresAt: string | null;
    daysRemaining: number | null;
  } | null;
  pendingOrganizationsProcessed?: boolean;
  message?: string;
  error?: string;
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
    const supabaseAnonKey = Deno.env.get("SUPABASE_ANON_KEY")!;

    // Create Supabase clients
    const supabaseAdmin = createClient(supabaseUrl, supabaseServiceKey);
    const supabaseAnon = createClient(supabaseUrl, supabaseAnonKey);

    // Parse request body
    const requestBody: SignInRequest = await req.json();
    const { email, password } = requestBody;

    // Validate required fields
    if (!email || !password) {
      return new Response(
        JSON.stringify({
          success: false,
          error: "Email and password are required",
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

    console.log(`Processing signin for: ${email}`);

    // Step 1: Authenticate user
    const { data: authData, error: authError } =
      await supabaseAnon.auth.signInWithPassword({
        email: email,
        password: password,
      });

    if (authError || !authData.user) {
      console.error("Authentication failed:", authError);
      return new Response(
        JSON.stringify({
          success: false,
          error: authError?.message || "Invalid email or password",
        }),
        {
          status: 401,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        },
      );
    }

    const userId = authData.user.id;
    const emailConfirmed = authData.user.email_confirmed_at !== null;
    const userName = authData.user.user_metadata?.name || email.split("@")[0];

    console.log(
      `User authenticated: ${userId}, Email confirmed: ${emailConfirmed}`,
    );

    let pendingOrganizationsProcessed = false;

    // Step 2: If email is confirmed, process pending organizations
    if (emailConfirmed) {
      try {
        // 2a. Ensure user profile exists
        const { error: profileError } = await supabaseAdmin
          .from("user_profiles")
          .upsert(
            {
              id: userId,
              email: email,
              name: userName,
            },
            {
              onConflict: "id",
            },
          );

        if (profileError) {
          console.error("Failed to upsert user profile:", profileError);
        } else {
          console.log("User profile ensured");
        }

        // 2b. Check for pending organizations
        const { data: pendingOrgs, error: pendingError } = await supabaseAdmin
          .from("pending_organizations")
          .select("*")
          .eq("user_email", email);

        if (pendingError) {
          console.error("Failed to query pending organizations:", pendingError);
        } else if (pendingOrgs && pendingOrgs.length > 0) {
          console.log(`Found ${pendingOrgs.length} pending organization(s)`);

          // Process each pending organization
          for (const pendingOrg of pendingOrgs) {
            try {
              console.log(
                `Processing pending org: ${pendingOrg.organization_name}`,
              );

              // Check if organization already exists
              const { data: existingOrgs, error: searchError } =
                await supabaseAdmin
                  .from("organizations")
                  .select("*")
                  .eq("name", pendingOrg.organization_name);

              if (searchError) {
                console.error("Failed to search organizations:", searchError);
                continue;
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
                  console.error(
                    "Failed to add user to organization:",
                    memberError,
                  );
                  continue;
                }

                console.log("User added to existing organization");
              } else {
                // Create new organization
                // Mark as personal trial org since this came from pending_organizations (single-user signup)
                const { data: newOrg, error: orgError } = await supabaseAdmin
                  .from("organizations")
                  .insert({
                    name: pendingOrg.organization_name,
                    owner_id: userId,
                    is_trial: true,
                    trial_expires_at: new Date(
                      Date.now() + 14 * 24 * 60 * 60 * 1000,
                    ).toISOString(),
                    is_personal_trial_org: true, // Mark for cleanup if user joins another org
                  })
                  .select()
                  .single();

                if (orgError || !newOrg) {
                  console.error("Failed to create organization:", orgError);
                  continue;
                }

                organizationId = newOrg.id;
                console.log(
                  `Created new personal trial organization: ${organizationId}`,
                );

                // Add user as admin (owner_id in organizations table tracks ownership)
                // Valid roles are 'admin' and 'member' only
                const { error: memberError } = await supabaseAdmin
                  .from("organization_members")
                  .insert({
                    organization_id: organizationId,
                    user_id: userId,
                    role: "admin",
                    status: "active",
                    has_license: true, // Assign license to organization owner
                    accepted_at: new Date().toISOString(),
                  });

                if (memberError) {
                  console.error("Failed to add user as admin:", memberError);
                  continue;
                }

                console.log("User added as organization admin");
              }

              // Delete the pending organization record
              const { error: deleteError } = await supabaseAdmin
                .from("pending_organizations")
                .delete()
                .eq("id", pendingOrg.id);

              if (deleteError) {
                console.error(
                  "Failed to delete pending organization:",
                  deleteError,
                );
              } else {
                console.log(`Deleted pending organization: ${pendingOrg.id}`);
                pendingOrganizationsProcessed = true;
              }
            } catch (orgError) {
              console.error(
                `Error processing pending org ${pendingOrg.organization_name}:`,
                orgError,
              );
              // Continue with other pending orgs
            }
          }
        } else {
          console.log("No pending organizations found");
        }
      } catch (processingError) {
        console.error(
          "Error during pending organization processing:",
          processingError,
        );
        // Don't fail the signin, just log the error
      }
    }

    // Step 3: Query organization info to return trial status
    let organizationInfo = null;
    if (emailConfirmed) {
      const { data: orgMember } = await supabaseAdmin
        .from("organization_members")
        .select(
          "organization_id, organizations(id, name, is_trial, trial_expires_at)",
        )
        .eq("user_id", userId)
        .single();

      if (orgMember && orgMember.organizations) {
        const org = Array.isArray(orgMember.organizations)
          ? orgMember.organizations[0]
          : orgMember.organizations;

        organizationInfo = {
          id: org.id,
          name: org.name,
          isTrial: org.is_trial,
          trialExpiresAt: org.trial_expires_at,
          daysRemaining:
            org.is_trial && org.trial_expires_at
              ? Math.ceil(
                  (new Date(org.trial_expires_at).getTime() - Date.now()) /
                    (1000 * 60 * 60 * 24),
                )
              : null,
        };
      }
    }

    // Step 4: Return success response
    return new Response(
      JSON.stringify({
        success: true,
        user: {
          id: userId,
          email: email,
          name: userName,
          emailConfirmed: emailConfirmed,
        },
        organization: organizationInfo,
        pendingOrganizationsProcessed: pendingOrganizationsProcessed,
        message: "Successfully signed in!",
      } as SignInResponse),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      },
    );
  } catch (error) {
    console.error("Signin error:", error);
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

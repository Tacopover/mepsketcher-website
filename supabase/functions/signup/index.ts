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
    const { email, password, name, organizationName } = requestBody;

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

        // 2b. Handle organization
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

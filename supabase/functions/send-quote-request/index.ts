import { serve } from "https://deno.land/std@0.168.0/http/server.ts";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SALES_EMAIL = "sales@mepsketcher.com"; // Your sales team email

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface QuoteRequest {
  name: string;
  email: string;
  company: string;
  phone?: string;
  licenses: number;
  requirements?: string;
  timestamp: string;
}

serve(async (req) => {
  // Handle CORS preflight requests
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const body: QuoteRequest = await req.json();
    const { name, email, company, phone, licenses, requirements, timestamp } =
      body;

    if (!name || !email || !company || !licenses) {
      return new Response(
        JSON.stringify({ error: "Missing required fields" }),
        {
          status: 400,
          headers: { ...corsHeaders, "Content-Type": "application/json" },
        }
      );
    }

    console.log(`Processing quote request from ${name} (${company})`);

    if (!RESEND_API_KEY) {
      console.error("RESEND_API_KEY not configured");
      throw new Error("Email service not configured");
    }

    // Send email to sales team via Resend
    const emailResponse = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${RESEND_API_KEY}`,
      },
      body: JSON.stringify({
        from: "MepSketcher Quote System <noreply@mepsketcher.com>",
        to: [SALES_EMAIL],
        reply_to: email, // Allow direct reply to the customer
        subject: `Enterprise Quote Request - ${company} (${licenses} licenses)`,
        html: generateQuoteRequestEmailHTML({
          name,
          email,
          company,
          phone: phone || "Not provided",
          licenses,
          requirements: requirements || "None specified",
          timestamp,
        }),
      }),
    });

    if (!emailResponse.ok) {
      const errorText = await emailResponse.text();
      console.error("Resend API error:", errorText);
      throw new Error(`Failed to send quote request email: ${errorText}`);
    }

    const emailData = await emailResponse.json();
    console.log("Quote request email sent successfully:", emailData.id);

    return new Response(
      JSON.stringify({
        success: true,
        emailId: emailData.id,
      }),
      {
        status: 200,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  } catch (error) {
    console.error("Error sending quote request:", error);
    return new Response(
      JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      {
        status: 500,
        headers: { ...corsHeaders, "Content-Type": "application/json" },
      }
    );
  }
});

function generateQuoteRequestEmailHTML(params: {
  name: string;
  email: string;
  company: string;
  phone: string;
  licenses: number;
  requirements: string;
  timestamp: string;
}): string {
  const formattedDate = new Date(params.timestamp).toLocaleString("en-US", {
    dateStyle: "full",
    timeStyle: "short",
  });

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>New Enterprise Quote Request</title>
</head>
<body style="margin: 0; padding: 0; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f4f4f4; padding: 40px 0;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color: #ffffff; border-radius: 8px; box-shadow: 0 2px 8px rgba(0,0,0,0.1);">
          <!-- Header -->
          <tr>
            <td style="padding: 40px 40px 20px;">
              <h1 style="margin: 0; color: #333333; font-size: 24px;">🎯 New Enterprise Quote Request</h1>
            </td>
          </tr>
          
          <!-- Content -->
          <tr>
            <td style="padding: 20px 40px;">
              <p style="margin: 0 0 20px; color: #666666; font-size: 16px; line-height: 1.5;">
                A potential customer has requested an enterprise quote for MepSketcher.
              </p>
              
              <!-- Customer Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #f8f9fa; border-radius: 4px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 15px; color: #333333; font-size: 18px;">Contact Information</h3>
                    
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; color: #666666; font-size: 14px; font-weight: 600; width: 140px;">Name:</td>
                        <td style="padding: 8px 0; color: #333333; font-size: 14px;">${
                          params.name
                        }</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; font-size: 14px; font-weight: 600;">Email:</td>
                        <td style="padding: 8px 0;">
                          <a href="mailto:${
                            params.email
                          }" style="color: #0066cc; text-decoration: none;">
                            ${params.email}
                          </a>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; font-size: 14px; font-weight: 600;">Company:</td>
                        <td style="padding: 8px 0; color: #333333; font-size: 14px;">${
                          params.company
                        }</td>
                      </tr>
                      <tr>
                        <td style="padding: 8px 0; color: #666666; font-size: 14px; font-weight: 600;">Phone:</td>
                        <td style="padding: 8px 0; color: #333333; font-size: 14px;">${
                          params.phone
                        }</td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- License Details -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #e8f4f8; border-radius: 4px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 15px; color: #333333; font-size: 18px;">License Requirements</h3>
                    
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding: 8px 0; color: #666666; font-size: 14px; font-weight: 600; width: 140px;">Licenses Needed:</td>
                        <td style="padding: 8px 0; color: #333333; font-size: 14px;">
                          <strong style="color: #0066cc; font-size: 16px;">${
                            params.licenses
                          }</strong> licenses
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>
              
              <!-- Requirements -->
              ${
                params.requirements !== "None specified"
                  ? `
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color: #fff3cd; border-radius: 4px; margin-bottom: 20px;">
                <tr>
                  <td style="padding: 20px;">
                    <h3 style="margin: 0 0 15px; color: #333333; font-size: 18px;">Special Requirements</h3>
                    <p style="margin: 0; color: #666666; font-size: 14px; line-height: 1.6; white-space: pre-wrap;">
                      ${params.requirements}
                    </p>
                  </td>
                </tr>
              </table>
              `
                  : ""
              }
              
              <!-- Quick Actions -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding: 30px 0 20px;">
                    <a href="mailto:${
                      params.email
                    }?subject=Re: MepSketcher Enterprise Quote Request" 
                       style="display: inline-block; padding: 14px 40px; background-color: #0066cc; color: #ffffff; text-decoration: none; border-radius: 4px; font-size: 16px; font-weight: 600; margin: 0 10px 10px 0;">
                      Reply to Customer
                    </a>
                  </td>
                </tr>
              </table>
              
              <p style="margin: 20px 0 0; color: #999999; font-size: 12px;">
                <strong>Request submitted:</strong> ${formattedDate}
              </p>
            </td>
          </tr>
          
          <!-- Footer -->
          <tr>
            <td style="padding: 30px 40px; border-top: 1px solid #eeeeee; text-align: center;">
              <p style="margin: 0; color: #999999; font-size: 12px;">
                This email was automatically generated by the MepSketcher quote request system.
              </p>
              <p style="margin: 10px 0 0; color: #999999; font-size: 12px;">
                © ${new Date().getFullYear()} MepSketcher. All rights reserved.
              </p>
            </td>
          </tr>
        </table>
      </td>
    </tr>
  </table>
</body>
</html>
  `.trim();
}

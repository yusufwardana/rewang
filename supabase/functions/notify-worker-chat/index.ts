import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });
}

function normalizePhone(value: string) {
  const digits = value.replace(/\D/g, "");
  return digits.startsWith("0") ? `62${digits.slice(1)}` : digits.startsWith("8") ? `62${digits}` : digits;
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);
  const token = (request.headers.get("Authorization") ?? "").replace(/^Bearer\s+/i, "");
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  if (!token || !supabaseUrl || !publishableKey || !secretKey) return respond({ error: "Authentication or server configuration missing." }, 401);

  try {
    const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
    const { data: { user }, error: authError } = await admin.auth.getUser(token);
    if (authError || !user) return respond({ error: "Sign in again to continue." }, 401);
    const body = await request.json();
    const unlockedId = typeof body.unlocked_id === "string" ? body.unlocked_id : "";
    if (!unlockedId) return respond({ error: "Unlocked contact is required." }, 400);

    const { data: contact, error: contactError } = await admin
      .from("unlocked_contacts")
      .select("id,buyer_id,worker_id,no_wa_terbuka,status")
      .eq("id", unlockedId)
      .eq("buyer_id", user.id)
      .single();
    if (contactError || !contact || contact.status !== "active") return respond({ error: "Contact is not available." }, 404);

    const userClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const { error: clickError } = await userClient.rpc("mark_contact_chatted", { p_unlocked_id: unlockedId });
    if (clickError) throw clickError;

    const accessToken = Deno.env.get("WHATSAPP_ACCESS_TOKEN");
    const phoneNumberId = Deno.env.get("WHATSAPP_PHONE_NUMBER_ID");
    const template = Deno.env.get("WHATSAPP_CHAT_NOTIFICATION_TEMPLATE");
    const language = Deno.env.get("WHATSAPP_TEMPLATE_LANGUAGE") ?? "id";
    const apiVersion = Deno.env.get("WHATSAPP_API_VERSION");
    if (!accessToken || !phoneNumberId || !template || !apiVersion) return respond({ recorded: true, notified: false, reason: "whatsapp_not_configured" });

    const [{ data: buyer }, { data: worker }] = await Promise.all([
      admin.from("buyers").select("nama").eq("id", user.id).single(),
      admin.from("workers").select("nama").eq("id", contact.worker_id).single(),
    ]);
    const recipient = normalizePhone(contact.no_wa_terbuka);
    if (recipient.length < 10) return respond({ recorded: true, notified: false, reason: "invalid_worker_number" });

    const apiResponse = await fetch(`https://graph.facebook.com/${apiVersion}/${phoneNumberId}/messages`, {
      method: "POST",
      headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
      body: JSON.stringify({
        messaging_product: "whatsapp",
        to: recipient,
        type: "template",
        template: {
          name: template,
          language: { code: language },
          components: [{
            type: "body",
            parameters: [
              { type: "text", text: buyer?.nama || user.email || "Pembeli RewangOS" },
              { type: "text", text: worker?.nama || "profil Anda" },
            ],
          }],
        },
      }),
    });
    if (!apiResponse.ok) {
      console.error("WhatsApp Cloud API rejected chat notification", apiResponse.status);
      return respond({ recorded: true, notified: false, reason: "whatsapp_delivery_failed" });
    }
    return respond({ recorded: true, notified: true });
  } catch (error) {
    console.error("notify-worker-chat failed", error);
    return respond({ error: error instanceof Error ? error.message : "Could not record chat click." }, 400);
  }
});

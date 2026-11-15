import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

function respond(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

Deno.serve(async (request: Request) => {
  if (request.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (request.method !== "POST") return respond({ error: "Method not allowed" }, 405);

  const authorization = request.headers.get("Authorization") ?? "";
  const token = authorization.replace(/^Bearer\s+/i, "");
  if (!token) return respond({ error: "Sign in with email OTP before checkout." }, 401);

  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const publishableKey = Deno.env.get("SUPABASE_ANON_KEY") ?? Deno.env.get("SUPABASE_PUBLISHABLE_KEY");
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  const midtransServerKey = Deno.env.get("MIDTRANS_SERVER_KEY");
  if (!supabaseUrl || !publishableKey || !secretKey || !midtransServerKey) {
    return respond({ error: "Checkout server is not configured. Set Supabase and Midtrans sandbox secrets." }, 503);
  }

  try {
    const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
    const { data: authData, error: authError } = await admin.auth.getUser(token);
    if (authError || !authData.user?.email) return respond({ error: "Your email session is invalid. Sign in again." }, 401);

    const payload = await request.json();
    const packageId = typeof payload.package_id === "string" ? payload.package_id : "";
    if (!packageId) return respond({ error: "Choose a valid credit package." }, 400);

    const userClient = createClient(supabaseUrl, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
      global: { headers: { Authorization: `Bearer ${token}` } },
    });
    const date = new Date().toISOString().slice(0, 10).replaceAll("-", "");
    const orderId = `RWG-${date}-${crypto.randomUUID()}`;
    const { data: purchase, error: purchaseError } = await userClient
      .rpc("create_pending_purchase", { p_package_id: packageId, p_order_id: orderId })
      .single();
    if (purchaseError || !purchase) throw purchaseError ?? new Error("Could not create purchase.");

    const { data: buyer, error: buyerError } = await admin
      .from("buyers")
      .select("email,nama,no_wa")
      .eq("id", authData.user.id)
      .single();
    if (buyerError || !buyer) throw buyerError ?? new Error("Buyer profile not found.");

    const midtransResponse = await fetch("https://app.sandbox.midtrans.com/snap/v1/transactions", {
      method: "POST",
      headers: {
        Authorization: `Basic ${btoa(`${midtransServerKey}:`)}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        transaction_details: { order_id: purchase.order_id, gross_amount: purchase.harga_total },
        item_details: [{
          id: purchase.package_id,
          price: purchase.harga_total,
          quantity: 1,
          name: `Kredit RewangOS (${purchase.jumlah_kredit_dibeli})`,
        }],
        customer_details: {
          first_name: buyer.nama || buyer.email.split("@")[0],
          email: buyer.email,
          ...(buyer.no_wa ? { phone: buyer.no_wa } : {}),
        },
      }),
    });
    const midtransBody = await midtransResponse.json().catch(() => ({}));
    if (!midtransResponse.ok || typeof midtransBody.token !== "string") {
      await admin.from("purchases").update({ status: "failed" }).eq("id", purchase.id).eq("status", "pending");
      return respond({ error: "Midtrans could not create the checkout session. Try again." }, 502);
    }

    const { error: updateError } = await admin
      .from("purchases")
      .update({ snap_token: midtransBody.token })
      .eq("id", purchase.id)
      .eq("buyer_id", authData.user.id);
    if (updateError) throw updateError;

    return respond({
      order_id: purchase.order_id,
      snap_token: midtransBody.token,
      jumlah_kredit: purchase.jumlah_kredit_dibeli,
      harga_total: purchase.harga_total,
    });
  } catch (error) {
    console.error("create-midtrans-snap failed", error);
    return respond({ error: error instanceof Error ? error.message : "Checkout failed." }, 400);
  }
});

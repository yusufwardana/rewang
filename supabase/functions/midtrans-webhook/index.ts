import { createClient } from "npm:@supabase/supabase-js@2.119.0";

const corsHeaders = { "Access-Control-Allow-Origin": "*", "Content-Type": "application/json" };

const rewangOrderId = /^RWG-\d{8}-[0-9a-f]{8}(?:-[0-9a-f]{4}){3}-[0-9a-f]{12}$/i;

Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405, headers: corsHeaders });
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const secretKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? Deno.env.get("SUPABASE_SECRET_KEY");
  const serverKey = Deno.env.get("MIDTRANS_SERVER_KEY");
  if (!supabaseUrl || !secretKey || !serverKey) return new Response("Webhook is not configured", { status: 503 });

  const notification = await request.json().catch(() => null);
  const orderId = notification?.order_id;
  if (typeof orderId !== "string" || !orderId) {
    return new Response("Invalid notification", { status: 400 });
  }
  if (!rewangOrderId.test(orderId)) return new Response("Order ignored", { status: 200 });

  try {
    const admin = createClient(supabaseUrl, secretKey, { auth: { persistSession: false } });
    const { data: purchase, error: purchaseError } = await admin
      .from("purchases")
      .select("status,harga_total")
      .eq("order_id", orderId)
      .maybeSingle();
    if (purchaseError) throw purchaseError;
    if (!purchase || purchase.status !== "pending") return new Response("Order ignored", { status: 200 });

    // A callback identifies the order. Only Midtrans's status API can confirm payment.
    const statusResponse = await fetch(
      `https://api.sandbox.midtrans.com/v2/${encodeURIComponent(orderId)}/status`,
      {
        headers: { Authorization: `Basic ${btoa(`${serverKey}:`)}`, Accept: "application/json" },
        signal: AbortSignal.timeout(8000),
      },
    ).catch(() => null);
    if (!statusResponse?.ok) return new Response("Midtrans status unavailable", { status: 503 });

    const transaction = await statusResponse.json().catch(() => null);
    if (transaction?.order_id !== orderId || typeof transaction.transaction_status !== "string") {
      return new Response("Midtrans status unavailable", { status: 503 });
    }
    const amount = Number(transaction.gross_amount);
    if (!Number.isInteger(amount) || amount <= 0 || amount !== purchase.harga_total || transaction.currency !== "IDR") {
      return new Response("Payment amount or currency mismatch", { status: 400 });
    }
    const transactionStatus = transaction.transaction_status.toLowerCase();
    const fraudStatus = String(transaction.fraud_status ?? "").toLowerCase();
    let status: "paid" | "pending" | "failed" | "expired";
    if (transactionStatus === "settlement" || (transactionStatus === "capture" && fraudStatus === "accept")) status = "paid";
    else if (transactionStatus === "pending") status = "pending";
    else if (transactionStatus === "expire") status = "expired";
    else if (transactionStatus === "capture" && fraudStatus === "challenge") status = "pending";
    else if (["cancel", "deny", "failure"].includes(transactionStatus)) status = "failed";
    else return new Response("Notification status ignored", { status: 200, headers: corsHeaders });

    const { error } = await admin.rpc("apply_midtrans_notification", {
      p_order_id: orderId,
      p_gross_amount: amount,
      p_status: status,
      p_payment_type: String(transaction.payment_type ?? ""),
    });
    if (error) throw error;
    return new Response("OK", { status: 200, headers: corsHeaders });
  } catch (error) {
    console.error("midtrans-webhook failed", error);
    return new Response("Notification processing failed", { status: 500, headers: corsHeaders });
  }
});

# Supabase and Midtrans sandbox setup

The buyer and payment migration is `migrations/20261114190000_rewangos_demand_payments.sql`. It is local source only; this repo does not apply it to a hosted project.

## Supabase

1. Apply the migration to a development project after reviewing the target schema.
2. Enable email OTP in Supabase Auth and configure the site's allowed redirect URLs.
3. Set Edge Function secrets in the Supabase project. Keep server keys out of `.env` and browser code:

```sh
supabase secrets set MIDTRANS_SERVER_KEY=your-sandbox-server-key
```

The Edge Function runtime also needs the project's standard `SUPABASE_URL`, `SUPABASE_ANON_KEY`, and `SUPABASE_SERVICE_ROLE_KEY` secrets. New key projects may instead use `SUPABASE_PUBLISHABLE_KEY` and `SUPABASE_SECRET_KEY`.

## Midtrans sandbox

1. Put the sandbox client key in the frontend `.env` as `VITE_MIDTRANS_CLIENT_KEY`.
2. Keep the sandbox client key in the frontend and set the sandbox server key as the Edge Function secret above. The checkout endpoint is sandbox-only.
3. Deploy `create-midtrans-snap` with JWT verification enabled.
4. Deploy `midtrans-webhook` with JWT verification disabled, then set its URL as the sandbox payment notification URL in Midtrans.
5. Deploy `notify-worker-chat` with JWT verification enabled.

The webhook looks up the order and verifies its status, amount, and currency through the Midtrans Sandbox Get Status API before it can credit a buyer. Browser checkout callbacks do not grant credits.

## Database notes

- Public directory reads use `workers_directory`, which omits `no_wa`; contact unlocks return a per-buyer phone snapshot.
- `buyers.id` is the Supabase Auth user UUID. Email OTP is passwordless and the Auth trigger creates the buyer row.
- Report approval is restricted to authenticated users whose server-managed `app_metadata.role` is `admin`.
- The six extra worker tables are private scaffolding derived from fields already represented in `workers`; worker account/editing flows are not added in this change.
- Worker click notifications use WhatsApp Cloud API only when `WHATSAPP_ACCESS_TOKEN`, `WHATSAPP_PHONE_NUMBER_ID`, an approved two-parameter `WHATSAPP_CHAT_NOTIFICATION_TEMPLATE`, and a supported `WHATSAPP_API_VERSION` are configured as Edge Function secrets. Set optional `WHATSAPP_TEMPLATE_LANGUAGE` (default `id`). Without those secrets, `sudah_chat` is still recorded and the function reports that notification was not sent.

```sh
supabase secrets set WHATSAPP_ACCESS_TOKEN=your-token WHATSAPP_PHONE_NUMBER_ID=your-number-id WHATSAPP_CHAT_NOTIFICATION_TEMPLATE=approved_template_name WHATSAPP_API_VERSION=your-supported-version
```

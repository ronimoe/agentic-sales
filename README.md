# Laris

AI sales platform prototype for Indonesian sellers: Meta ad plans and creative, human approval, ad monitoring, a WhatsApp closer, and order tracking across chat, websites, and marketplaces.

## Run it

```bash
pnpm install
pnpm dev
```

Open http://localhost:3000. With no keys, every external service runs as a labelled simulation and sample data is created on first load.

```bash
pnpm exec vitest run
```

## Connect real services

Copy `.env.example` to `.env.local` and fill in what you have. Never paste keys in chat. Settings shows what's connected.

- **Claude:** `ANTHROPIC_API_KEY` turns on real planning and the closer. Requests use `fallbacks: "default"`, so a declined request retries on a fallback model server-side.
- **Meta:** ads are always created PAUSED unless `META_ALLOW_ACTIVATE=true`.
- **WhatsApp:** Evolution API with Baileys is for the prototype only. Use a dedicated test number. Set its webhook to `/api/webhooks/evolution?token=EVOLUTION_WEBHOOK_TOKEN`, and run it on a separate always-on server.
- **Shopify:** order webhook to `/api/webhooks/shopify`, signed with `SHOPIFY_WEBHOOK_SECRET`.
- **Vercel site:** POST orders to `/api/webhooks/website` with a base64 HMAC-SHA256 of the body in `x-laris-signature`. Pass `?ref=LRS-XXXXX` through checkout to link the order to its ad.
- **Marketplaces:** import CSV exports on the Orders screen.

## Database

A temporary PGlite database lives in `.data/`. Delete that folder to reset the sample data, and delete it before connecting Meta, Claude, or WhatsApp so simulated data doesn't mix with real results. Sample data is only created when nothing is connected.

For remote Supabase, set `DATABASE_URL` and apply migrations with the pinned CLI:

```bash
pnpm exec supabase db push --db-url "$DATABASE_URL"
```

Every table has row level security on with no policies, so it isn't reachable through Supabase's public API.

## Before deploying to Vercel

This prototype isn't ready to deploy yet. Generated assets are stored on local disk, video rendering needs ffmpeg, and login is a password gate with cookie-based workspace switching. Move assets to Supabase Storage, render video on a worker, and add Supabase Auth first.

## How the code is arranged

- `src/lib/ads/`: pause and scale rules, margin-based limits, creative checks, Meta adapter
- `src/lib/knowledge/`: product facts, store policies, readiness test
- `src/lib/whatsapp/`: official-rules check, Evolution adapter, inbound and send
- `src/lib/ai/`: creative plan and the closer agent, whose tools exclude ads, budgets, and rules
- `src/lib/pipeline.ts`: plan, approve, launch, monitor, simulate
- `src/lib/orders/`: chat orders, CSV import, webhooks

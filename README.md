# demo-prism

Side-by-side demo: hyperswitch-prism vs direct Stripe/Adyen integration.

Same flow, same processors, same browser SDK — only the server differs. Read the four server modules side-by-side to see the integration delta.

## Layout

```
server/
  normal/{stripe,adyen}.ts   # direct: raw HTTP per Stripe/Adyen API docs (no SDK)
  prism/{stripe,adyen}.ts    # via `hyperswitch-prism`
client/
  normal/{stripe,adyen}.{html,js}
  prism/{stripe,adyen}.{html,js}   # client SDK code is identical to its `normal/` twin
```

The `normal/` modules deliberately use raw `fetch()` against the official REST endpoints
(`api.stripe.com/v1/payment_intents`, `checkout-test.adyen.com/v71/sessions`) rather than the
official npm SDKs. Using `stripe` and `@adyen/api-library` would hide the integration friction
prism is meant to solve — auth headers, content-type quirks (form-urlencoded vs JSON), error
shapes, version pinning, host selection (test vs live URL prefix). The raw-HTTP version is what
you'd actually write the first time you read either company's docs.

## Setup

1. **Install:**
   ```sh
   cd /Users/yashasvi.kapil/demo-prism
   npm install
   ```
2. **Configure:**
   ```sh
   cp .env.example .env
   ```
   Edit `.env`:
   - `CREDS_JSON_PATH` — path to `hyperswitch-prism/creds.json` (Stripe + Adyen test keys load from here at boot).
   - `STRIPE_PUBLISHABLE_KEY` — pre-filled with the test key from `creds.json`.
   - `ADYEN_CLIENT_KEY` — **must be set manually**. Get it from Adyen Customer Area → Developers → API credentials.
3. **Run:**
   ```sh
   npm run dev
   ```
   Server boots on `http://localhost:3000`.

## Pages

| URL | Server module |
|-----|---------------|
| `/` | landing |
| `/normal/stripe` | `server/normal/stripe.ts` |
| `/normal/adyen`  | `server/normal/adyen.ts`  |
| `/prism/stripe`  | `server/prism/stripe.ts`  |
| `/prism/adyen`   | `server/prism/adyen.ts`   |

## Test cards

| Processor | Number | Expiry | CVC |
|-----------|--------|--------|-----|
| Stripe | `4242 4242 4242 4242` | any future | any |
| Adyen  | `4111 1111 4555 1142` | `03/30`    | `737` |

## What to compare

Run all four flows, then:

```sh
wc -l server/normal/*.ts server/prism/*.ts
```

Then read each pair side-by-side. The two `prism/` modules differ only in which `ConnectorConfig` they import; the two `normal/` modules use entirely different SDKs with no shared shape.

## Verifying payments

- Stripe: https://dashboard.stripe.com/test/payments
- Adyen: https://ca-test.adyen.com/ — merchant `JuspayDEECOM`

## Known environmental issues

- **Prism native dylib arch must match your Node binary.** `hyperswitch-prism@0.0.8` ships an arm64 dylib; if your local Node is x86_64 (e.g. running under Rosetta on Apple Silicon), the load fails with `incompatible architecture`. Easiest fix: build the dylib from the local prism repo and swap it in:
  ```sh
  # From hyperswitch-prism repo:  cargo build (produces target/debug/libconnector_service_ffi.dylib)
  cp /path/to/hyperswitch-prism/target/debug/libconnector_service_ffi.dylib \
     node_modules/hyperswitch-prism/dist/src/payments/generated/libconnector_service_ffi.dylib
  ```
  Or install a Node binary that matches the dylib's arch.
- **`creds.json` Stripe key may be expired.** If `/api/normal/stripe/intent` returns `api_key_expired`, set `STRIPE_API_KEY` in `.env` directly — the loader uses `.env` when present and only falls back to `creds.json`.
- **`ADYEN_CLIENT_KEY` is not in `creds.json`** — it must be fetched from the Adyen Customer Area separately and put in `.env`.

## Smoke test (without test cards)

Quickly verify wiring with the server running:
```sh
curl -s http://localhost:3000/health
curl -s -X POST http://localhost:3000/api/normal/stripe/intent  -H 'Content-Type: application/json' -d '{"amount":1000,"currency":"usd"}'
curl -s -X POST http://localhost:3000/api/normal/adyen/session  -H 'Content-Type: application/json' -d '{"amount":1000,"currency":"USD"}'
curl -s -X POST http://localhost:3000/api/prism/stripe/sdk-session -H 'Content-Type: application/json' -d '{"amount":1000,"currency":"USD"}'
curl -s -X POST http://localhost:3000/api/prism/adyen/sdk-session  -H 'Content-Type: application/json' -d '{"amount":1000,"currency":"USD"}'
```

## Out of scope

- 3DS challenges (handled by SDK defaults only)
- Webhooks (Stripe direct uses `confirmPayment`'s sync return; Adyen uses `onPaymentCompleted`)
- Capture / refund / void

# demo-prism

Side-by-side demo: hyperswitch-prism vs direct Stripe/Adyen integration.

Same flow, same processors, same browser SDK — only the server differs. Read the four server modules side-by-side to see the integration delta.

## Layout

```
server/
  normal/stripe.ts     # one file per connector. Different host / auth header /
  normal/adyen.ts      #   content type / body shape / response. Adding a third
                       #   connector means writing a third file from scratch.
  prism/checkout.ts    # one file. One `connectors` map. ONE shared `let payload`
                       #   reused for every connector. Add a connector by adding
                       #   one line to the map.
client/
  normal/{stripe,adyen}.{html,js}   # 4 pages, same browser SDKs as the prism pages
  prism/{stripe,adyen}.{html,js}
```

The structural contrast is the demo's whole point — open the two files side-by-side.
The `normal/checkout.ts` body grows linearly with the number of connectors you support.
The `prism/checkout.ts` body stays exactly the same; you only edit the `connectors` map.

The direct adapters use raw `fetch()` against the official REST endpoints rather than
official npm SDKs (`stripe`, `@adyen/api-library`). The SDKs would hide the very friction
prism is meant to solve — auth headers, content-type quirks, error shapes, version pinning,
host selection. The raw-HTTP version is what you'd actually write the first time you read
either company's docs.

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

Run all four flows, then read the three files side-by-side:

```sh
wc -l server/normal/stripe.ts server/normal/adyen.ts server/prism/checkout.ts
# 101  server/normal/stripe.ts   — form-urlencoded brackets, 25+ fields
# 139  server/normal/adyen.ts    — nested JSON, 30+ fields, totally different shape
# 154  server/prism/checkout.ts  — ONE shared `let payload = {…}` covers BOTH connectors
```

The two normal files share **zero** field names (Stripe: `metadata[customer_tier]`, Adyen: `additionalData.authorisationType`; Stripe: `shipping[address][line1]`, Adyen: `billingAddress.street + houseNumberOrName`). The prism file uses one canonical shape for `customer`, `address`, `metadata`, etc.

Adding a 3rd connector via direct: write a 3rd file ~100 lines.
Adding a 3rd connector via prism: one line in the `connectors` map.

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

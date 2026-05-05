import fs from 'fs';
import dotenv from 'dotenv';

dotenv.config();

interface CredsJson {
  stripe?: {
    connector_1?: {
      connector_account_details?: { api_key?: string };
      metadata?: {
        google_pay?: {
          allowed_payment_methods?: Array<{
            tokenization_specification?: {
              parameters?: Record<string, string>;
            };
          }>;
        };
      };
    };
  };
  adyen?: {
    connector_account_details?: { api_key?: string; key1?: string };
  };
}

function loadCreds(): void {
  const credsPath = process.env.CREDS_JSON_PATH;
  if (!credsPath) {
    throw new Error('CREDS_JSON_PATH must be set in .env');
  }
  if (!fs.existsSync(credsPath)) {
    throw new Error(`creds.json not found at ${credsPath}`);
  }

  const raw = fs.readFileSync(credsPath, 'utf8');
  const creds: CredsJson = JSON.parse(raw);

  if (!process.env.STRIPE_API_KEY) {
    const stripeKey = creds.stripe?.connector_1?.connector_account_details?.api_key;
    if (!stripeKey) throw new Error('stripe.connector_1.connector_account_details.api_key missing in creds.json');
    process.env.STRIPE_API_KEY = stripeKey;
  }

  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    const gpayParams = creds.stripe?.connector_1?.metadata?.google_pay?.allowed_payment_methods?.[0]?.tokenization_specification?.parameters;
    const pubKey = gpayParams?.['stripe:publishableKey'];
    if (pubKey) process.env.STRIPE_PUBLISHABLE_KEY = pubKey;
  }

  if (!process.env.ADYEN_API_KEY) {
    const adyenKey = creds.adyen?.connector_account_details?.api_key;
    if (!adyenKey) throw new Error('adyen.connector_account_details.api_key missing in creds.json');
    process.env.ADYEN_API_KEY = adyenKey;
  }
  if (!process.env.ADYEN_MERCHANT_ACCOUNT) {
    const adyenMerchant = creds.adyen?.connector_account_details?.key1;
    if (!adyenMerchant) throw new Error('adyen.connector_account_details.key1 (merchant account) missing in creds.json');
    process.env.ADYEN_MERCHANT_ACCOUNT = adyenMerchant;
  }

  if (!process.env.ADYEN_CLIENT_KEY) {
    console.warn('[creds-loader] ADYEN_CLIENT_KEY not set in .env — Adyen Drop-in will fail to mount.');
  }
  if (!process.env.STRIPE_PUBLISHABLE_KEY) {
    console.warn('[creds-loader] STRIPE_PUBLISHABLE_KEY not set — Stripe.js will fail to mount.');
  }
}

// Run on module load so process.env is populated before any other module
// (e.g. normal/stripe.ts, normal/adyen.ts) instantiates an SDK client.
loadCreds();


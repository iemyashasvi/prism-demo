import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────
// Direct Stripe integration — POST /v1/payment_intents
//
//   Auth:         Authorization: Bearer sk_test_...
//   Content-Type: application/x-www-form-urlencoded   (NOT JSON)
//   Encoding:     bracket-notation for ANY nested data
//   Naming:       snake_case
//   Response:     snake_case JSON  (client_secret, payment_method, etc.)
//
// Stripe's PaymentIntents has 50+ optional parameters. Real merchants set
// receipt copy, statement descriptors, 3DS preferences, shipping, line-
// item metadata, customer profile, future-use flags, automatic-payment-
// method config… AND none of the JS APIs natively serialize nested objects
// to form-urlencoded with brackets. Every integration writes its own
// flattener (or pulls in `qs`) — see toFormBody() below.
// ─────────────────────────────────────────────────────────────────────────

// Recursively flatten a structured object into form-urlencoded with
// Stripe's bracket-notation keys. Pure glue code that exists only because
// Stripe's wire format isn't JSON.
function toFormBody(obj: any, prefix = ''): string {
  return Object.entries(obj)
    .filter(([, v]) => v !== undefined && v !== null)
    .map(([k, v]) => {
      const key = prefix ? `${prefix}[${k}]` : k;
      if (v && typeof v === 'object' && !Array.isArray(v)) return toFormBody(v, key);
      return `${encodeURIComponent(key)}=${encodeURIComponent(String(v))}`;
    })
    .join('&');
}

router.post('/session', async (req, res) => {
  try {
    const { amount, currency = 'usd' } = req.body;
    const orderId = `ord_${uuidv4().slice(0, 12)}`;

    const payload = {
      // Core
      amount,
      currency: String(currency).toLowerCase(),
      capture_method: 'automatic_async',

      // Payment-method auto-discovery (Stripe-specific feature)
      automatic_payment_methods: { enabled: true, allow_redirects: 'never' },

      // 3-D Secure / saved-card behaviour (snake_case — not camelCase)
      payment_method_options: {
        card: {
          request_three_d_secure: 'automatic',
          setup_future_usage: 'off_session'
        }
      },

      // Customer-facing copy
      description: `Order ${orderId} — Premium Widget XL`,
      statement_descriptor_suffix: 'PRISMDEMO',
      receipt_email: 'customer@example.com',

      // Shipping. Stripe has no separate billing address on intents — only
      // shipping. Note the snake_case + `state` (vs Adyen's camelCase +
      // `stateOrProvince`).
      shipping: {
        name: 'Jane Doe',
        phone: '+1-555-0123',
        address: {
          line1: '123 Market Street',
          line2: 'Suite 400',
          city: 'San Francisco',
          state: 'CA',
          postal_code: '94105',
          country: 'US'
        }
      },

      // Stripe's freeform metadata: flat string→string map (no nesting)
      metadata: {
        order_id: orderId,
        customer_id: 'cust_demo_001',
        customer_tier: 'gold',
        product_sku: 'WIDGET-PREMIUM-XL',
        source: 'demo-prism',
        checkout_session_id: uuidv4()
      }
    };

    const r = await fetch('https://api.stripe.com/v1/payment_intents', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2024-06-20',
        'Idempotency-Key': uuidv4()
      },
      body: toFormBody(payload)
    });

    const data: any = await r.json();
    if (!r.ok) {
      console.error('[normal/stripe/session]', data);
      return res.status(r.status).json({
        error: 'StripeError',
        code: data.error?.code,
        type: data.error?.type,
        param: data.error?.param,
        message: data.error?.message || `HTTP ${r.status}`
      });
    }

    res.json({
      clientSecret: data.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
    });
  } catch (e) {
    console.error('[normal/stripe/session]', e);
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ error: 'NetworkError', message });
  }
});

export default router;

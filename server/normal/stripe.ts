import { Router } from 'express';

const router = Router();

// Stripe REST API: https://docs.stripe.com/api/payment_intents/create
// No SDK — raw fetch matches what you'd write following the docs.
const STRIPE_API = 'https://api.stripe.com/v1';

router.post('/intent', async (req, res) => {
  try {
    const { amount, currency = 'usd' } = req.body;

    // Stripe requires application/x-www-form-urlencoded with bracket notation
    // for nested fields. URLSearchParams handles the encoding but not bracketing.
    const body = new URLSearchParams();
    body.append('amount', String(amount));
    body.append('currency', String(currency).toLowerCase());
    body.append('automatic_payment_methods[enabled]', 'true');

    const resp = await fetch(`${STRIPE_API}/payment_intents`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${process.env.STRIPE_API_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded',
        'Stripe-Version': '2024-06-20'
      },
      body: body.toString()
    });

    const data = await resp.json() as any;

    if (!resp.ok) {
      console.error('[normal/stripe/intent]', data);
      return res.status(resp.status).json({
        error: 'StripeError',
        code: data.error?.code,
        message: data.error?.message || `HTTP ${resp.status}`
      });
    }

    res.json({
      clientSecret: data.client_secret,
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || ''
    });
  } catch (error) {
    console.error('[normal/stripe/intent]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'NetworkError', message });
  }
});

export default router;

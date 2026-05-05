import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────
// Direct Adyen integration — POST /v71/sessions
//
//   Auth:         x-API-key: AQE...                  (NOT Bearer)
//   Content-Type: application/json                    (NOT form-encoded)
//   Encoding:     deeply nested objects + arrays
//   Naming:       camelCase                           (NOT snake_case)
//   Required:     merchantAccount, returnUrl, countryCode (none of these
//                 exist in Stripe's request)
//   Response:     camelCase JSON  (id, sessionData)   completely different
//                 shape from Stripe's clientSecret
//   Live host:    a per-merchant LIVE_URL_PREFIX, NOT the test host
//
// Adyen's Sessions API has 60+ optional fields. A production merchant
// sets shopper profile, locale, channel, billing + delivery addresses,
// line items, application fingerprint, recurring-processing model, risk
// data, store-token policy, additionalData freeform map… nothing here
// shares a name OR a shape with Stripe's request.
// ─────────────────────────────────────────────────────────────────────────

router.post('/session', async (req, res) => {
  try {
    const { amount, currency = 'USD' } = req.body;
    const reference = `order_${uuidv4().slice(0, 12)}`;
    const upper = String(currency).toUpperCase();

    const payload = {
      // ── Required ─────────────────────────────────────────────────────
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      amount: { currency: upper, value: Number(amount) },
      reference,
      returnUrl: `${process.env.BASE_URL || 'http://localhost:3001'}/normal/adyen?ref=${reference}`,
      countryCode: upper === 'EUR' ? 'NL' : 'US',

      // ── Shopper profile ─────────────────────────────────────────────
      shopperReference: 'shopper_demo_001',
      shopperEmail: 'customer@example.com',
      shopperName: { firstName: 'Jane', lastName: 'Doe' },
      shopperLocale: 'en-US',
      shopperIP: '127.0.0.1',
      telephoneNumber: '+15550123',
      channel: 'Web',

      // ── Billing address (nested object — compare with Stripe's
      //    bracket-notation form fields above) ─────────────────────────
      billingAddress: {
        street: 'Market Street',
        houseNumberOrName: '123',
        city: 'San Francisco',
        stateOrProvince: 'CA',
        postalCode: '94105',
        country: 'US'
      },
      deliveryAddress: {
        street: 'Market Street',
        houseNumberOrName: '123',
        city: 'San Francisco',
        stateOrProvince: 'CA',
        postalCode: '94105',
        country: 'US'
      },

      // ── Order line items (array of objects — Stripe's PaymentIntents
      //    has no equivalent on this endpoint) ─────────────────────────
      lineItems: [
        {
          id: 'WIDGET-PREMIUM-XL',
          description: 'Premium Widget XL',
          amountIncludingTax: Number(amount),
          quantity: 1,
          taxPercentage: 0
        }
      ],

      // ── Tokenization (storing the card on file requires its own
      //    risk-profile setup — keeping this off in the demo) ──────────
      storePaymentMethod: false,

      // ── Platform fingerprint (used by Adyen support / analytics) ────
      applicationInfo: {
        merchantApplication: { name: 'demo-prism', version: '1.0.0' }
      },

      // (Many other fields exist — `mcc`, `additionalData.authorisationType`,
      //  `riskData`, `shopperStatement`, `recurringProcessingModel`, … —
      //  but each requires specific account-level configuration in Adyen
      //  Customer Area. That's another flavour of the friction prism
      //  hides: every field has its own enablement story per merchant.)
    };

    const r = await fetch('https://checkout-test.adyen.com/v71/sessions', {
      method: 'POST',
      headers: {
        'x-API-key': process.env.ADYEN_API_KEY!,
        'Content-Type': 'application/json',
        'Idempotency-Key': uuidv4()
      },
      body: JSON.stringify(payload)
    });

    const data: any = await r.json();
    if (!r.ok) {
      console.error('[normal/adyen/session]', data);
      return res.status(r.status).json({
        error: 'AdyenError',
        code: data.errorCode,
        type: data.errorType,
        message: data.message || `HTTP ${r.status}`,
        pspReference: data.pspReference
      });
    }

    res.json({
      id: data.id,
      sessionData: data.sessionData,
      clientKey: process.env.ADYEN_CLIENT_KEY || ''
    });
  } catch (e) {
    console.error('[normal/adyen/session]', e);
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ error: 'NetworkError', message });
  }
});

export default router;

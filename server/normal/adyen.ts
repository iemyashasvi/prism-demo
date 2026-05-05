import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// ─────────────────────────────────────────────────────────────────────────
// Direct Adyen integration — Advanced (two-step) flow that mirrors prism:
//
//   1. POST /payment-methods → POST  checkout-test.adyen.com/v71/paymentMethods
//   2. POST /authorize       → POST  checkout-test.adyen.com/v71/payments
//
//   Auth:         x-API-key: AQE...                  (NOT Bearer)
//   Content-Type: application/json                    (NOT form-encoded)
//   Encoding:     deeply nested objects + arrays
//   Naming:       camelCase                           (NOT snake_case)
//   Required:     merchantAccount, returnUrl, countryCode (none of these
//                 exist in Stripe's request)
//   Response:     camelCase JSON  (resultCode, pspReference)  completely
//                 different shape from Stripe's `status`/`id`
//   Live host:    a per-merchant LIVE_URL_PREFIX, NOT the test host
//
// Adyen's `/payments` API has 60+ optional fields. A production merchant
// sets shopper profile, locale, channel, billing + delivery addresses,
// line items, application fingerprint, recurring-processing model, risk
// data, store-token policy, additionalData freeform map… nothing here
// shares a name OR a shape with Stripe's request.
// ─────────────────────────────────────────────────────────────────────────

const ADYEN_HOST = 'https://checkout-test.adyen.com/v71';

router.post('/payment-methods', async (req, res) => {
  try {
    const { amount, currency = 'USD' } = req.body;
    const upper = String(currency).toUpperCase();

    const payload = {
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      amount: { currency: upper, value: Number(amount) },
      countryCode: upper === 'EUR' ? 'NL' : 'US',
      channel: 'Web',
      shopperLocale: 'en-US'
    };

    const r = await fetch(`${ADYEN_HOST}/paymentMethods`, {
      method: 'POST',
      headers: {
        'x-API-key': process.env.ADYEN_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(payload)
    });

    const data: any = await r.json();
    if (!r.ok) {
      console.error('[normal/adyen/payment-methods]', data);
      return res.status(r.status).json({
        error: 'AdyenError',
        code: data.errorCode,
        type: data.errorType,
        message: data.message || `HTTP ${r.status}`
      });
    }

    res.json({
      paymentMethodsResponse: data,
      clientKey: process.env.ADYEN_CLIENT_KEY || ''
    });
  } catch (e) {
    console.error('[normal/adyen/payment-methods]', e);
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ error: 'NetworkError', message });
  }
});

// ─────────────────────────────────────────────────────────────────────────
// /authorize — server-side `/v71/payments` with the encrypted card payload
// the Adyen Web SDK collected on the client.
//
// `paymentMethod` here is Adyen's encrypted blob ({ type, encryptedCardNumber,
// encryptedExpiryMonth, … }) — the SDK never gives us the raw PAN. Compare
// with Stripe's `pm_xxx` token: same idea, totally different wire shape.
// ─────────────────────────────────────────────────────────────────────────
router.post('/authorize', async (req, res) => {
  try {
    const { amount, currency = 'USD', paymentMethod, browserInfo, riskData } = req.body;
    if (!paymentMethod) {
      return res.status(400).json({ error: 'BadRequest', message: 'paymentMethod (encrypted card data) is required' });
    }

    const reference = `order_${uuidv4().slice(0, 12)}`;
    const upper = String(currency).toUpperCase();

    const payload = {
      // ── Required ─────────────────────────────────────────────────────
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      amount: { currency: upper, value: Number(amount) },
      reference,
      returnUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/normal/adyen?ref=${reference}`,
      countryCode: upper === 'EUR' ? 'NL' : 'US',

      // ── Encrypted card data from the SDK ────────────────────────────
      paymentMethod,
      browserInfo,
      riskData,

      // ── Shopper profile ─────────────────────────────────────────────
      shopperReference: 'shopper_demo_001',
      shopperEmail: 'customer@example.com',
      shopperName: { firstName: 'Jane', lastName: 'Doe' },
      shopperLocale: 'en-US',
      shopperIP: '127.0.0.1',
      telephoneNumber: '+15550123',
      channel: 'Web',
      origin: process.env.BASE_URL || 'http://localhost:3000',

      // ── Billing / delivery address (nested objects — compare with
      //    Stripe's bracket-notation form fields above) ────────────────
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

      // ── Order line items (Stripe's PaymentIntents has no equivalent
      //    on this endpoint) ───────────────────────────────────────────
      lineItems: [
        {
          id: 'WIDGET-PREMIUM-XL',
          description: 'Premium Widget XL',
          amountIncludingTax: Number(amount),
          quantity: 1,
          taxPercentage: 0
        }
      ],

      storePaymentMethod: false,

      applicationInfo: {
        merchantApplication: { name: 'demo-prism', version: '1.0.0' }
      }
    };

    const r = await fetch(`${ADYEN_HOST}/payments`, {
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
      console.error('[normal/adyen/authorize]', data);
      return res.status(r.status).json({
        error: 'AdyenError',
        code: data.errorCode,
        type: data.errorType,
        message: data.message || `HTTP ${r.status}`,
        pspReference: data.pspReference
      });
    }

    res.json({
      resultCode: data.resultCode,
      pspReference: data.pspReference,
      action: data.action || null,
      refusalReason: data.refusalReason,
      refusalReasonCode: data.refusalReasonCode
    });
  } catch (e) {
    console.error('[normal/adyen/authorize]', e);
    const message = e instanceof Error ? e.message : 'Unknown error';
    res.status(500).json({ error: 'NetworkError', message });
  }
});

export default router;

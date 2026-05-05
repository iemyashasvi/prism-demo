import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';

const router = Router();

// Adyen Checkout API: https://docs.adyen.com/api-explorer/Checkout/71/post/sessions
// No SDK — raw fetch matches what you'd write following the docs.
// Note: production uses a merchant-specific URL prefix (LIVE_URL_PREFIX).
//   https://{LIVE_URL_PREFIX}-checkout-live.adyenpayments.com/checkout/v71
// Test uses the static host below.
const ADYEN_TEST_API = 'https://checkout-test.adyen.com/v71';

router.post('/session', async (req, res) => {
  try {
    const { amount, currency = 'USD' } = req.body;
    const reference = `order_${uuidv4().slice(0, 12)}`;
    const upperCurrency = String(currency).toUpperCase();

    const sessionRequest = {
      merchantAccount: process.env.ADYEN_MERCHANT_ACCOUNT,
      amount: { currency: upperCurrency, value: Number(amount) },
      reference,
      returnUrl: `${process.env.BASE_URL || 'http://localhost:3000'}/normal/adyen?ref=${reference}`,
      countryCode: upperCurrency === 'EUR' ? 'NL' : 'US'
    };

    const resp = await fetch(`${ADYEN_TEST_API}/sessions`, {
      method: 'POST',
      headers: {
        'x-API-key': process.env.ADYEN_API_KEY!,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify(sessionRequest)
    });

    const data = await resp.json() as any;

    if (!resp.ok) {
      console.error('[normal/adyen/session]', data);
      return res.status(resp.status).json({
        error: 'AdyenError',
        code: data.errorCode,
        message: data.message || `HTTP ${resp.status}`
      });
    }

    res.json({
      id: data.id,
      sessionData: data.sessionData,
      clientKey: process.env.ADYEN_CLIENT_KEY || ''
    });
  } catch (error) {
    console.error('[normal/adyen/session]', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    res.status(500).json({ error: 'NetworkError', message });
  }
});

export default router;

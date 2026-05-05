import { Router } from 'express';
import { PaymentClient, MerchantAuthenticationClient, types } from 'hyperswitch-prism';
import { v4 as uuidv4 } from 'uuid';
import { stripeConfig, adyenConfig } from './config.js';
import { currencyEnum, statusText, handlePrismError } from './utils.js';

const { CaptureMethod, CountryAlpha2 } = types;
const router = Router();

// ─────────────────────────────────────────────────────────────────────────
// Add a connector here. That is the only place the connector matters —
// every payload below is connector-agnostic and reused as-is.
// ─────────────────────────────────────────────────────────────────────────
const connectors: Record<string, () => types.ConnectorConfig> = {
  stripe: stripeConfig,
  adyen:  adyenConfig
  // paypal:    paypalConfig,
  // checkout:  checkoutConfig,
  // cybersource: cybersourceConfig,
};

router.post('/:connector/sdk-session', async (req, res) => {
  try {
    const config = connectors[req.params.connector]?.();
    if (!config) return res.status(400).json({ error: `unknown connector: ${req.params.connector}` });

    const { amount, currency = 'USD' } = req.body;
    const orderId = `ord_${uuidv4().slice(0, 12)}`;

    // ───────────────────────────────────────────────────────────────────
    // ONE payload — works for stripe, adyen, and the 80+ other connectors
    // prism ships with. Same field names, same types, same shape, every
    // time. Compare with server/normal/{stripe,adyen}.ts.
    // ───────────────────────────────────────────────────────────────────
    let payload: types.MerchantAuthenticationServiceCreateClientAuthenticationTokenRequest = {
      merchantClientSessionId: `session_${Date.now()}`,
      testMode: true,
      payment: {
        amount: { minorAmount: amount, currency: currencyEnum(currency) },
        countryAlpha2Code: CountryAlpha2.US,
        returnUrl: `${process.env.BASE_URL || 'http://localhost:3001'}/${req.params.connector}/return`,
        customer: {
          id: 'cust_demo_001',
          name: 'Jane Doe',
          email: { value: 'customer@example.com' },
          phoneNumber: '+15550123',
          phoneCountryCode: '+1'
        },
        metadata: { value: JSON.stringify({
          order_id:      orderId,
          customer_tier: 'gold',
          product_sku:   'WIDGET-PREMIUM-XL',
          source:        'demo-prism'
        }) }
      }
    };

    const session = await new MerchantAuthenticationClient(config).createClientAuthenticationToken(payload);

    // Each connector's frontend SDK reads different fields from the
    // response. Prism normalizes them onto one envelope; the browser
    // picks what it needs.
    const cs = session.sessionData?.connectorSpecific;
    res.json({
      clientSecret:   cs?.stripe?.clientSecret?.value || '',
      id:             cs?.adyen?.sessionId            || '',
      sessionData:    cs?.adyen?.sessionData?.value   || '',
      publishableKey: process.env.STRIPE_PUBLISHABLE_KEY || '',
      clientKey:      process.env.ADYEN_CLIENT_KEY      || '',
      merchantTransactionId: `txn_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
      orderId,
      amount, currency
    });
  } catch (e) { handlePrismError(res, e, 'prism/sdk-session'); }
});

router.post('/:connector/authorize', async (req, res) => {
  try {
    const config = connectors[req.params.connector]?.();
    if (!config) return res.status(400).json({ error: `unknown connector: ${req.params.connector}` });

    const { token, merchantTransactionId, amount, currency, orderId } = req.body;

    // ───────────────────────────────────────────────────────────────────
    // Same shape, every connector. The `customer`, `address`, `metadata`,
    // and other rich fields prism's normal/* files have to express in
    // wildly different ways here have ONE canonical structure.
    // ───────────────────────────────────────────────────────────────────
    let payload: types.PaymentServiceTokenAuthorizeRequest = {
      merchantTransactionId,
      merchantOrderId: orderId || `ord_${uuidv4().slice(0, 12)}`,
      amount: { minorAmount: amount, currency: currencyEnum(currency) },
      connectorToken: { value: token },
      captureMethod: CaptureMethod.AUTOMATIC,
      testMode: true,

      customer: {
        id: 'cust_demo_001',
        name: 'Jane Doe',
        email: { value: 'customer@example.com' },
        phoneNumber: '+15550123',
        phoneCountryCode: '+1'
      },

      // One address shape; prism maps this onto Stripe's `shipping[…]`
      // bracket notation OR Adyen's `billingAddress`/`deliveryAddress`
      // nested objects under the hood.
      address: {
        billingAddress: {
          firstName: { value: 'Jane' },
          lastName:  { value: 'Doe' },
          line1:     { value: '123 Market Street' },
          line2:     { value: 'Suite 400' },
          city:      { value: 'San Francisco' },
          state:     { value: 'CA' },
          zipCode:   { value: '94105' },
          countryAlpha2Code: CountryAlpha2.US,
          email:       { value: 'customer@example.com' },
          phoneNumber: { value: '+15550123' },
          phoneCountryCode: '+1'
        },
        shippingAddress: {
          firstName: { value: 'Jane' },
          lastName:  { value: 'Doe' },
          line1:     { value: '123 Market Street' },
          line2:     { value: 'Suite 400' },
          city:      { value: 'San Francisco' },
          state:     { value: 'CA' },
          zipCode:   { value: '94105' },
          countryAlpha2Code: CountryAlpha2.US
        }
      },

      description: `Order ${orderId || 'demo'} — Premium Widget XL`,
      returnUrl: `${process.env.BASE_URL || 'http://localhost:3001'}/${req.params.connector}/return`,
      metadata: { value: JSON.stringify({
        order_id:      orderId || 'demo',
        customer_tier: 'gold',
        product_sku:   'WIDGET-PREMIUM-XL',
        source:        'demo-prism'
      }) }
    };

    const result = await new PaymentClient(config).tokenAuthorize(payload);
    res.json({
      status: result.status,
      statusText: statusText(result.status),
      connectorTransactionId: result.connectorTransactionId,
      error: result.error?.unifiedDetails?.message || result.error?.connectorDetails?.message || null
    });
  } catch (e) { handlePrismError(res, e, 'prism/authorize'); }
});

export default router;

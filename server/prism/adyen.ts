import { Router } from 'express';
import { PaymentClient, types } from 'hyperswitch-prism';
import { v4 as uuidv4 } from 'uuid';
import { adyenConfig } from './config.js';
import { createSession, currencyEnum, statusText, handlePrismError } from './utils.js';

const { CaptureMethod } = types;
const router = Router();

router.post('/sdk-session', async (req, res) => {
  try {
    const { amount, currency = 'USD' } = req.body;
    const session = await createSession(adyenConfig(), amount, currency);
    const adyenData = session.sessionData?.connectorSpecific?.adyen;
    res.json({
      id: adyenData?.sessionId || '',
      sessionData: adyenData?.sessionData?.value || '',
      clientKey: process.env.ADYEN_CLIENT_KEY || '',
      merchantTransactionId: `txn_${uuidv4().replace(/-/g, '').slice(0, 16)}`,
      amount,
      currency
    });
  } catch (error) {
    handlePrismError(res, error, 'prism/adyen/sdk-session');
  }
});

router.post('/authorize', async (req, res) => {
  try {
    const { token, merchantTransactionId, amount, currency } = req.body;
    const client = new PaymentClient(adyenConfig());
    const result = await client.tokenAuthorize({
      merchantTransactionId,
      amount: { minorAmount: amount, currency: currencyEnum(currency) },
      connectorToken: { value: token },
      captureMethod: CaptureMethod.AUTOMATIC,
      address: {}
    });
    res.json({
      status: result.status,
      statusText: statusText(result.status),
      connectorTransactionId: result.connectorTransactionId,
      error: result.error?.unifiedDetails?.message || result.error?.connectorDetails?.message || null
    });
  } catch (error) {
    handlePrismError(res, error, 'prism/adyen/authorize');
  }
});

export default router;

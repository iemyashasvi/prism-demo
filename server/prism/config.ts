import { types } from 'hyperswitch-prism';

const { Environment } = types;

export const stripeConfig = (): types.ConnectorConfig => ({
  connectorConfig: {
    stripe: { apiKey: { value: process.env.STRIPE_API_KEY! } }
  },
  options: { environment: Environment.SANDBOX }
});

export const adyenConfig = (): types.ConnectorConfig => ({
  connectorConfig: {
    adyen: {
      apiKey: { value: process.env.ADYEN_API_KEY! },
      merchantAccount: { value: process.env.ADYEN_MERCHANT_ACCOUNT! }
    }
  },
  options: { environment: Environment.SANDBOX }
});

import { types, MerchantAuthenticationClient, IntegrationError, ConnectorError } from 'hyperswitch-prism';
import { Response } from 'express';

const { Currency, PaymentStatus } = types;

export const currencyEnum = (s: string): types.Currency =>
  s.toUpperCase() === 'EUR' ? Currency.EUR : Currency.USD;

export async function createSession(
  config: types.ConnectorConfig,
  amount: number,
  currency: string
): Promise<types.MerchantAuthenticationServiceCreateClientAuthenticationTokenResponse> {
  const authClient = new MerchantAuthenticationClient(config);
  return authClient.createClientAuthenticationToken({
    merchantClientSessionId: `session_${Date.now()}`,
    payment: {
      amount: { minorAmount: amount, currency: currencyEnum(currency) }
    }
  });
}

const statusMap: Record<number, string> = {
  [PaymentStatus.STARTED]: 'STARTED',
  [PaymentStatus.AUTHENTICATION_PENDING]: 'AUTHENTICATION_PENDING',
  [PaymentStatus.AUTHENTICATION_SUCCESSFUL]: 'AUTHENTICATION_SUCCESSFUL',
  [PaymentStatus.AUTHORIZED]: 'AUTHORIZED',
  [PaymentStatus.AUTHORIZATION_FAILED]: 'AUTHORIZATION_FAILED',
  [PaymentStatus.CHARGED]: 'CHARGED',
  [PaymentStatus.VOIDED]: 'VOIDED',
  [PaymentStatus.PENDING]: 'PENDING',
  [PaymentStatus.FAILURE]: 'FAILURE'
};
export const statusText = (s: number): string => statusMap[s] || `CODE_${s}`;

export function handlePrismError(res: Response, error: unknown, label: string): void {
  console.error(`[${label}]`, error);
  if (error instanceof IntegrationError) {
    res.status(400).json({ error: 'IntegrationError', code: error.errorCode, message: error.message });
    return;
  }
  if (error instanceof ConnectorError) {
    res.status(502).json({ error: 'ConnectorError', code: error.errorCode, message: error.message });
    return;
  }
  const message = error instanceof Error ? error.message : 'Unknown error';
  res.status(500).json({ error: 'ServerError', message });
}

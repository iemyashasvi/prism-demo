const AMOUNT = 1000;
const CURRENCY = 'USD';

const statusEl = document.getElementById('status');
const errEl = document.getElementById('error-msg');

function showStatus(kind, html) {
  statusEl.className = `status show ${kind}`;
  statusEl.innerHTML = html;
}

(async function init() {
  try {
    // Step 1 — server fetches /v71/paymentMethods and returns the SDK config.
    const r = await fetch('/api/normal/adyen/payment-methods', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: AMOUNT, currency: CURRENCY })
    });
    const cfg = await r.json();
    if (!cfg.paymentMethodsResponse) throw new Error(cfg.message || 'Failed to load payment methods');
    if (!cfg.clientKey) throw new Error('ADYEN_CLIENT_KEY is not set on server');

    const { AdyenCheckout, Card } = window.AdyenWeb;

    const checkout = await AdyenCheckout({
      paymentMethodsResponse: cfg.paymentMethodsResponse,
      clientKey: cfg.clientKey,
      environment: 'test',
      amount: { value: AMOUNT, currency: CURRENCY },
      countryCode: CURRENCY === 'EUR' ? 'NL' : 'US',
      locale: 'en-US',
      showPayButton: true,

      // Step 2 — SDK hands us the encrypted card payload; we forward it
      // to the server which calls /v71/payments. Mirrors prism's
      // tokenize-then-server-authorize split.
      onSubmit: async (state, component, actions) => {
        try {
          const r = await fetch('/api/normal/adyen/authorize', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              amount: AMOUNT,
              currency: CURRENCY,
              paymentMethod: state.data.paymentMethod,
              browserInfo: state.data.browserInfo,
              riskData: state.data.riskData
            })
          });
          const result = await r.json();

          if (result.error) {
            actions.reject({ errorMessage: result.message || result.error });
            return;
          }

          actions.resolve({
            resultCode: result.resultCode,
            action: result.action || undefined,
            order: result.order,
            donationToken: result.donationToken
          });
        } catch (e) {
          actions.reject({ errorMessage: e.message });
        }
      },

      onPaymentCompleted: (result) => {
        const ok = result.resultCode === 'Authorised';
        showStatus(ok ? 'ok' : 'err',
          `<strong>${result.resultCode}</strong>` +
          `<pre>resultCode: ${result.resultCode}</pre>`);
      },
      onPaymentFailed: (result) => {
        showStatus('err',
          `<strong>${result.resultCode || 'FAILED'}</strong>` +
          `<pre>${JSON.stringify(result, null, 2)}</pre>`);
      },
      onError: (error) => {
        if (error.name !== 'CANCEL') errEl.textContent = error.message;
      }
    });

    new Card(checkout, {
      hasHolderName: true,
      brands: ['visa', 'mc', 'amex', 'discover']
    }).mount('#adyen-card-container');
  } catch (e) {
    errEl.textContent = e.message;
  }
})();

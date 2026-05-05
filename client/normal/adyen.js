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
    const r = await fetch('/api/normal/adyen/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: AMOUNT, currency: CURRENCY })
    });
    const session = await r.json();
    if (!session.id) throw new Error(session.message || 'Failed to create Adyen session');
    if (!session.clientKey) throw new Error('ADYEN_CLIENT_KEY is not set on server');

    const { AdyenCheckout, Card } = window.AdyenWeb;

    const checkout = await AdyenCheckout({
      session: { id: session.id, sessionData: session.sessionData },
      clientKey: session.clientKey,
      environment: 'test',
      amount: { value: AMOUNT, currency: CURRENCY },
      countryCode: CURRENCY === 'EUR' ? 'NL' : 'US',
      locale: 'en-US',
      showPayButton: true,
      onPaymentCompleted: (result) => {
        const ok = result.resultCode === 'Authorised';
        showStatus(ok ? 'ok' : 'err',
          `<strong>${result.resultCode}</strong>` +
          `<pre>resultCode: ${result.resultCode}\nsessionResult: ${result.sessionResult || '-'}</pre>`);
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

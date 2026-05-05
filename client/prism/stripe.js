const AMOUNT = 1000;
const CURRENCY = 'USD';

let stripe, elements, merchantTransactionId;
const statusEl = document.getElementById('status');
const errEl = document.getElementById('error-msg');
const payBtn = document.getElementById('pay-btn');

function showStatus(kind, html) {
  statusEl.className = `status show ${kind}`;
  statusEl.innerHTML = html;
}

(async function init() {
  try {
    const r = await fetch('/api/prism/stripe/sdk-session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: AMOUNT, currency: CURRENCY })
    });
    const session = await r.json();
    if (!session.clientSecret) throw new Error(session.message || 'Failed to create prism session');
    merchantTransactionId = session.merchantTransactionId;

    stripe = Stripe(session.publishableKey);
    // paymentMethodCreation: 'manual' lets us tokenize without confirming —
    // prism's tokenAuthorize call on the server is what confirms.
    elements = stripe.elements({
      clientSecret: session.clientSecret,
      paymentMethodCreation: 'manual',
      appearance: { theme: 'stripe' }
    });
    elements.create('payment', { layout: 'tabs' }).mount('#payment-element');

    payBtn.disabled = false;
    payBtn.textContent = 'Pay $10.00';
  } catch (e) {
    errEl.textContent = e.message;
  }
})();

payBtn.addEventListener('click', async () => {
  payBtn.disabled = true;
  payBtn.textContent = 'Processing…';
  errEl.textContent = '';

  const { error: submitErr } = await elements.submit();
  if (submitErr) {
    errEl.textContent = submitErr.message;
    payBtn.disabled = false; payBtn.textContent = 'Pay $10.00';
    return;
  }

  const { paymentMethod, error: pmErr } = await stripe.createPaymentMethod({ elements });
  if (pmErr) {
    errEl.textContent = pmErr.message;
    payBtn.disabled = false; payBtn.textContent = 'Pay $10.00';
    return;
  }

  // Hand the token to the server — prism authorizes via PaymentClient.tokenAuthorize.
  const r = await fetch('/api/prism/stripe/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token: paymentMethod.id,
      merchantTransactionId,
      amount: AMOUNT,
      currency: CURRENCY
    })
  });
  const result = await r.json();

  const ok = ['CHARGED', 'AUTHORIZED'].includes(result.statusText);
  showStatus(ok ? 'ok' : 'err',
    `<strong>${result.statusText || 'ERROR'}</strong>` +
    `<pre>status: ${result.status} (${result.statusText})\n` +
    `connectorTransactionId: ${result.connectorTransactionId || '-'}\n` +
    (result.error ? `error: ${result.error}` : '') + `</pre>`);
  payBtn.textContent = ok ? 'Done' : 'Pay $10.00';
  if (!ok) payBtn.disabled = false;
});

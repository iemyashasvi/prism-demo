const AMOUNT = 1000;
const CURRENCY = 'usd';

let stripe, elements, paymentIntentId;
const statusEl = document.getElementById('status');
const errEl = document.getElementById('error-msg');
const payBtn = document.getElementById('pay-btn');

function showStatus(kind, html) {
  statusEl.className = `status show ${kind}`;
  statusEl.innerHTML = html;
}

(async function init() {
  try {
    const r = await fetch('/api/normal/stripe/session', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ amount: AMOUNT, currency: CURRENCY })
    });
    const { clientSecret, paymentIntentId: pid, publishableKey, message } = await r.json();
    if (!clientSecret) throw new Error(message || 'Failed to create PaymentIntent');
    paymentIntentId = pid;

    stripe = Stripe(publishableKey);
    // Manual creation: we tokenize on the client, hand the token to the server,
    // and the server confirms the intent with /v1/payment_intents/:id/confirm.
    elements = stripe.elements({
      clientSecret,
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

  // Hand the tokenised PM to the server — server confirms the intent.
  const r = await fetch('/api/normal/stripe/authorize', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      paymentIntentId,
      paymentMethodId: paymentMethod.id
    })
  });
  const result = await r.json();

  if (result.error) {
    errEl.textContent = result.message || result.error;
    payBtn.disabled = false; payBtn.textContent = 'Pay $10.00';
    showStatus('err', `<strong>Failed</strong><pre>${result.message || result.error}</pre>`);
    return;
  }

  const ok = result.status === 'succeeded' || result.status === 'requires_capture';
  showStatus(ok ? 'ok' : 'err',
    `<strong>${(result.status || 'ERROR').toUpperCase()}</strong>` +
    `<pre>id: ${result.id}\nstatus: ${result.status}\namount: ${result.amount} ${result.currency}</pre>`);
  payBtn.textContent = ok ? 'Done' : 'Pay $10.00';
  if (!ok) payBtn.disabled = false;
});

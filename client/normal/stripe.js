const AMOUNT = 1000;
const CURRENCY = 'usd';

let stripe, elements;
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
    const { clientSecret, publishableKey, message } = await r.json();
    if (!clientSecret) throw new Error(message || 'Failed to create PaymentIntent');

    stripe = Stripe(publishableKey);
    elements = stripe.elements({ clientSecret, appearance: { theme: 'stripe' } });
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

  // Direct flow: Stripe.js confirms the PaymentIntent against Stripe directly.
  const { error, paymentIntent } = await stripe.confirmPayment({
    elements,
    confirmParams: { return_url: window.location.href },
    redirect: 'if_required'
  });

  if (error) {
    errEl.textContent = error.message;
    payBtn.disabled = false;
    payBtn.textContent = 'Pay $10.00';
    showStatus('err', `<strong>Failed</strong><pre>${error.message}</pre>`);
    return;
  }

  showStatus('ok',
    `<strong>${paymentIntent.status.toUpperCase()}</strong>` +
    `<pre>id: ${paymentIntent.id}\nstatus: ${paymentIntent.status}\namount: ${paymentIntent.amount} ${paymentIntent.currency}</pre>`);
  payBtn.textContent = 'Done';
});

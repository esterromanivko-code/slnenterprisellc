/**
 * Creates a Stripe Checkout Session so a customer can pay an invoice from pay.html.
 *
 * Requires STRIPE_SECRET_KEY in Netlify -> Site settings -> Environment variables.
 * The key is read at runtime and never reaches the browser.
 *
 * Talks to the Stripe REST API directly with fetch so the site keeps its
 * zero-dependency, no-build-step setup (same approach as chat.js).
 */

/* -- Guard rails. Keep these in sync with PAY_CONFIG in pay.html. -- */
const MIN_CENTS     = 100;     //     $1.00
const MAX_CENTS     = 1000000; // $10,000.00
const MAX_TIP_CENTS = 200000;  //  $2,000.00

/* -- Stripe wants form-encoded bodies with bracketed nested keys -- */
function encodeForm(obj, prefix, out) {
  out = out || [];
  for (const [key, value] of Object.entries(obj)) {
    if (value === undefined || value === null || value === '') continue;
    const path = prefix ? `${prefix}[${key}]` : key;
    if (Array.isArray(value)) {
      value.forEach((item, i) => {
        if (item && typeof item === 'object') encodeForm(item, `${path}[${i}]`, out);
        else out.push(`${encodeURIComponent(`${path}[${i}]`)}=${encodeURIComponent(item)}`);
      });
    } else if (typeof value === 'object') {
      encodeForm(value, path, out);
    } else {
      out.push(`${encodeURIComponent(path)}=${encodeURIComponent(value)}`);
    }
  }
  return out.join('&');
}

/* -- Input cleaning -- */
function clean(value, maxLen) {
  if (typeof value !== 'string') return '';
  // Strip control characters, collapse whitespace, cap length.
  return value
    .replace(/[\u0000-\u001F\u007F]/g, '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, maxLen);
}

function isEmail(value) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value) && value.length <= 120;
}

function toCents(value) {
  const n = typeof value === 'number' ? value : parseInt(value, 10);
  return Number.isFinite(n) && n >= 0 ? Math.round(n) : NaN;
}

/* -- Work out the site origin for the success / cancel redirects -- */
function siteOrigin(event) {
  // Netlify sets URL to the site's primary address in production.
  if (process.env.URL) return process.env.URL.replace(/\/+$/, '');
  const headers = event.headers || {};
  const host  = headers['x-forwarded-host'] || headers.host;
  const proto = headers['x-forwarded-proto'] || 'https';
  return host ? `${proto}://${host}` : 'https://slnenterprisellc.online';
}

exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
  const JSON_HEADERS = { ...CORS, 'Content-Type': 'application/json' };

  const fail = (statusCode, error) => ({
    statusCode,
    headers: JSON_HEADERS,
    body: JSON.stringify({ error }),
  });

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }
  if (event.httpMethod !== 'POST') {
    return fail(405, 'Method Not Allowed');
  }

  const apiKey = process.env.STRIPE_SECRET_KEY;
  if (!apiKey) {
    console.error('[pay] STRIPE_SECRET_KEY is not set - card payments are disabled.');
    return fail(503, 'Card payments are not set up yet. Please use one of the other payment options or call us.');
  }

  let body;
  try {
    body = JSON.parse(event.body || '{}');
  } catch {
    return fail(400, 'We could not read that request. Please refresh the page and try again.');
  }

  /* -- Validate -- */
  const invoice = clean(body.invoice, 40);
  const name    = clean(body.name, 80);
  const email   = clean(body.email, 120);
  const address = clean(body.address, 140);
  const service = clean(body.service, 60);

  if (!invoice) return fail(400, 'Please enter your invoice number.');
  if (!name)    return fail(400, 'Please enter the name on the invoice.');
  if (!isEmail(email)) return fail(400, 'Please enter a valid email address for your receipt.');

  const amountCents = toCents(body.amountCents);
  if (!Number.isFinite(amountCents) || amountCents < MIN_CENTS || amountCents > MAX_CENTS) {
    return fail(400, 'Please enter an amount between $1 and $10,000. For larger invoices, give us a call.');
  }

  let tipCents = toCents(body.tipCents);
  if (!Number.isFinite(tipCents) || tipCents < 0) tipCents = 0;
  if (tipCents > MAX_TIP_CENTS) tipCents = MAX_TIP_CENTS;

  /* -- Build the Checkout Session -- */
  const origin = siteOrigin(event);
  const label  = service
    ? `${service} - Invoice ${invoice}`
    : `Cleaning Services - Invoice ${invoice}`;

  const lineItems = [{
    quantity: 1,
    price_data: {
      currency: 'usd',
      unit_amount: amountCents,
      product_data: {
        name: label,
        description: `SLN Enterprise LLC${address ? ' - ' + address : ''}`,
      },
    },
  }];

  if (tipCents > 0) {
    lineItems.push({
      quantity: 1,
      price_data: {
        currency: 'usd',
        unit_amount: tipCents,
        product_data: {
          name: 'Tip for the cleaning crew',
          description: `Invoice ${invoice}`,
        },
      },
    });
  }

  const metadata = { invoice, customer_name: name, service, service_address: address };

  const payload = {
    mode: 'payment',
    customer_email: email,
    billing_address_collection: 'auto',
    success_url: `${origin}/pay-success.html?invoice=${encodeURIComponent(invoice)}&session_id={CHECKOUT_SESSION_ID}`,
    cancel_url: `${origin}/pay.html?invoice=${encodeURIComponent(invoice)}&amount=${(amountCents / 100).toFixed(2)}&canceled=1`,
    line_items: lineItems,
    metadata,
    payment_intent_data: {
      description: label,
      receipt_email: email,
      metadata,
    },
  };

  try {
    const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/x-www-form-urlencoded',
      },
      body: encodeForm(payload),
    });

    const data = await res.json();

    if (!res.ok) {
      // Log the real reason for us; never echo Stripe's raw error to the customer.
      console.error('[pay] Stripe error:', JSON.stringify(data.error || data));
      return fail(502, 'We could not open the secure checkout just now. Please try again in a moment.');
    }

    return {
      statusCode: 200,
      headers: JSON_HEADERS,
      body: JSON.stringify({ url: data.url }),
    };
  } catch (err) {
    console.error('[pay] Function error:', err.message);
    return fail(500, 'Something went wrong on our end. Please try again or give us a call.');
  }
};

# Invoice Payments — Setup Guide

Everything for taking invoice payments lives in four files:

| File | What it is |
|---|---|
| `pay.html` | The page you send to customers |
| `pay-success.html` | What they see after paying |
| `pay-link.html` | Private tool for making personalised payment links |
| `netlify/functions/create-checkout-session.js` | Talks to Stripe (never touches the browser) |

---

## 1. Turn on card payments

Card payments stay switched off until you add your Stripe key. Until then the
page still works — customers just see the Zelle option instead.

1. Create a Stripe account at **stripe.com** and finish the business details for
   SLN Enterprise LLC (they will ask for your EIN and a bank account).
2. In Stripe, go to **Developers → API keys** and copy the **Secret key**. It
   starts with `sk_live_`.
3. In Netlify, open your site and go to
   **Site configuration → Environment variables → Add a variable**.
   - Key: `STRIPE_SECRET_KEY`
   - Value: paste the secret key
   - Scope: all deploy contexts
4. Click **Deploys → Trigger deploy → Deploy site** so the new variable is
   picked up.

That is the whole setup. Card, Apple Pay, and Google Pay all start working.

> **Never put the secret key in a file in this repository, in an email, or in a
> chat message.** The environment variable is the only place it belongs. If it
> ever leaks, click *Roll key* in Stripe immediately and repeat step 3.

To switch Apple Pay and Google Pay on, go to
**Stripe → Settings → Payment methods** and enable them. Nothing to change here.

---

## 2. Check your payment details

Open `pay.html` and find the `PAY_CONFIG` block near the bottom (search for
`PAYMENT SETTINGS`). It looks like this:

```js
var PAY_CONFIG = {
  cardEnabled: true,
  zelleHandle: '(206) 609-9422',
  venmoHandle: '',
  minAmount: 1,
  maxAmount: 10000
};
```

Two things to check before you send the page to anyone:

- **`zelleHandle`** — this is set to your business phone number. Confirm that
  number is actually enrolled with Zelle at your bank. If you use a different
  number or an email for Zelle, change it here. Set it to `''` to hide Zelle.
- **`venmoHandle`** — currently empty, so **the Venmo option is hidden**. If you
  want Venmo, put your username here including the `@`, for example
  `'@SLN-Enterprise'`.

Any method with an empty handle is removed from the page automatically, so a
customer never sees an option you cannot actually receive money through.

`maxAmount` caps what a customer can enter at $10,000. This is a safety limit
against typos; raise it here **and** in `MAX_CENTS` in
`netlify/functions/create-checkout-session.js` if you ever invoice more.

---

## 3. Sending a customer their invoice

Open **`pay-link.html`** on your own computer
(`https://slnenterprisellc.online/pay-link.html`). Fill in the invoice number
and amount, then copy either the link or the ready-written message and send it.

The customer opens the link with everything already filled in and just confirms.

Only the invoice number and amount really matter — the rest saves them typing.

**Keep `pay-link.html` to yourself.** It is marked `noindex, nofollow` and
nothing links to it, but anyone with the address can open it. Bookmark it rather
than sharing it. Customers only ever need `pay.html`.

You can also just send the plain page — `https://slnenterprisellc.online/pay.html`
— and let the customer type their own invoice number and amount.

---

## 4. Where the money shows up

- **Card payments** land in your Stripe dashboard under **Payments**, and pay
  out to your bank on Stripe's normal schedule (usually about 2 business days).
  Stripe's fee is roughly 2.9% + 30¢ per payment.
- Each payment records the **invoice number, customer name, service, and
  address** in Stripe, so you can match it to your books without guessing.
- **Tips** appear as a separate line item on the same payment, so you can see at
  a glance what to pass on to the crew.
- **Zelle and Venmo** payments arrive directly in your bank or Venmo account
  with no fee, and the customer is told to put the invoice number in the memo.
  These do **not** appear in Stripe — reconcile them from your bank statement.

Stripe emails the customer a receipt automatically. You don't need to send one.

---

## 5. Testing without taking real money

Use your Stripe **test** secret key (`sk_test_...`) in `STRIPE_SECRET_KEY`
instead of the live one, then pay with card number `4242 4242 4242 4242`, any
future expiry date, and any CVC. Nothing is charged. Swap back to the live key
when you're done.

---

## Troubleshooting

**"Card payments are not set up yet"** — `STRIPE_SECRET_KEY` isn't set, or the
site hasn't been redeployed since you added it. Redo steps 3 and 4 above.

**"We could not open the secure checkout just now"** — Stripe rejected the
request. Open **Netlify → Functions → create-checkout-session** and read the
log; the real reason is printed there. The most common causes are a mistyped key
and a Stripe account that hasn't finished its business verification.

**A customer says the amount was wrong** — the customer types the amount
themselves, so a typo is possible. Refund from the Stripe dashboard (**Payments
→ the payment → Refund**); it goes back to their card in 5–10 days.

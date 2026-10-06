/* Thin Supabase REST helpers shared by the chat and lead functions.
   Everything here fails soft: a CRM write must never break the customer's
   experience, but it always logs loudly enough to debug from the function log. */

const URL = process.env.SUPABASE_URL;
const KEY = process.env.SUPABASE_ANON_KEY;

function configured() {
  return Boolean(
    URL && KEY &&
    !URL.startsWith('your_') &&
    !KEY.startsWith('your_')
  );
}

function headers(extra) {
  return {
    'apikey': KEY,
    'Authorization': `Bearer ${KEY}`,
    'Content-Type': 'application/json',
    ...extra,
  };
}

/* Insert one row. Returns the created row when `select` is true, else null. */
async function insert(table, row, select) {
  if (!configured()) {
    console.warn(`[supabase] not configured — skipped insert into ${table}`);
    return null;
  }
  try {
    const res = await fetch(`${URL}/rest/v1/${table}`, {
      method: 'POST',
      headers: headers({ 'Prefer': select ? 'return=representation' : 'return=minimal' }),
      body: JSON.stringify(row),
    });
    if (!res.ok) {
      console.error(`[supabase] insert ${table} failed ${res.status}:`, await res.text());
      return null;
    }
    if (!select) return null;
    const rows = await res.json();
    return Array.isArray(rows) ? rows[0] : rows;
  } catch (err) {
    console.error(`[supabase] insert ${table} threw:`, err.message);
    return null;
  }
}

async function patch(table, match, row) {
  if (!configured()) return null;
  const qs = Object.entries(match).map(([k, v]) => `${k}=eq.${encodeURIComponent(v)}`).join('&');
  try {
    const res = await fetch(`${URL}/rest/v1/${table}?${qs}`, {
      method: 'PATCH',
      headers: headers({ 'Prefer': 'return=minimal' }),
      body: JSON.stringify(row),
    });
    if (!res.ok) console.error(`[supabase] patch ${table} failed ${res.status}:`, await res.text());
  } catch (err) {
    console.error(`[supabase] patch ${table} threw:`, err.message);
  }
  return null;
}

/* Split a free-text contact string into whichever of email/phone it holds. */
function splitContact(contact) {
  const out = {};
  if (!contact) return out;
  const str = String(contact);
  const email = str.match(/[\w.+-]+@[\w-]+\.[\w.]+/);
  if (email) out.email = email[0];
  const digits = str.replace(/\D/g, '');
  if (digits.length >= 10) out.phone = digits.slice(-10);
  return out;
}

/* Cheap, explainable lead score. Contact info is what makes a lead actionable,
   so it carries the most weight. */
function scoreLead(lead) {
  let score = 0;
  if (lead.phone) score += 30;
  if (lead.email) score += 25;
  if (lead.name) score += 10;
  if (lead.service_requested) score += 15;
  if (lead.location) score += 10;
  if (lead.frequency && !/one.?time/i.test(lead.frequency)) score += 10;
  return Math.min(score, 100);
}

/* Email the team about a new lead. No-ops unless RESEND_API_KEY is set. */
async function notifyLead(lead) {
  const key = process.env.RESEND_API_KEY;
  const to  = process.env.LEAD_NOTIFY_EMAIL;
  if (!key || !to) return;

  const rows = Object.entries(lead)
    .filter(([, v]) => v !== undefined && v !== null && v !== '')
    .map(([k, v]) => `<tr><td style="padding:4px 12px 4px 0;color:#888">${k}</td><td style="padding:4px 0"><b>${v}</b></td></tr>`)
    .join('');

  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: process.env.LEAD_NOTIFY_FROM || 'SLN Leads <onboarding@resend.dev>',
        to: [to],
        subject: `New lead: ${lead.name || 'Unknown'}${lead.service_requested ? ' — ' + lead.service_requested : ''}`,
        html: `<h2 style="font-family:system-ui">New lead from ${lead.source || 'the website'}</h2>
               <table style="font-family:system-ui;font-size:14px">${rows}</table>`,
      }),
    });
    if (!res.ok) console.error('[notify] resend failed', res.status, await res.text());
  } catch (err) {
    console.error('[notify] threw:', err.message);
  }
}

module.exports = { configured, insert, patch, splitContact, scoreLead, notifyLead };

/* Quote-form leads → Supabase + email notification.
   Netlify Forms is the system of record (it captures the submission even if this
   function fails); this mirrors the lead into the CRM so the team can work it. */

const db = require('../lib/supabase');

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'Content-Type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function clean(v) {
  if (v === undefined || v === null) return undefined;
  const s = String(v).trim();
  return s === '' ? undefined : s.slice(0, 1000);
}

exports.handler = async (event) => {
  if (event.httpMethod === 'OPTIONS') return { statusCode: 204, headers: CORS, body: '' };
  if (event.httpMethod !== 'POST') return { statusCode: 405, headers: CORS, body: 'Method Not Allowed' };

  let f;
  try {
    f = JSON.parse(event.body || '{}');
  } catch {
    return { statusCode: 400, headers: CORS, body: JSON.stringify({ error: 'Invalid body' }) };
  }

  // Honeypot — a filled bot-field means a bot, so accept and discard.
  if (clean(f['bot-field'])) return { statusCode: 200, headers: CORS, body: JSON.stringify({ ok: true }) };

  const name = [clean(f.first_name), clean(f.last_name)].filter(Boolean).join(' ') || clean(f.name);

  const notes = [
    clean(f.message),
    clean(f.sqft) ? `Approx. size: ${clean(f.sqft)}` : null,
  ].filter(Boolean).join('\n');

  const lead = {
    name,
    email: clean(f.email),
    phone: clean(f.phone),
    location: clean(f.address),
    service_requested: clean(f.service),
    frequency: clean(f.frequency),
    notes: notes || undefined,
    source: clean(f.source) || 'website_quote_form',
    status: 'new',
    created_at: new Date().toISOString(),
  };
  lead.lead_score = db.scoreLead(lead);
  lead.summary = `${lead.service_requested || 'Cleaning'} request from ${lead.name || 'website visitor'}`;

  // Both fail soft: Netlify Forms already holds the submission.
  await Promise.allSettled([
    db.insert('leads', lead),
    db.notifyLead(lead),
  ]);

  return { statusCode: 200, headers: { ...CORS, 'Content-Type': 'application/json' }, body: JSON.stringify({ ok: true }) };
};

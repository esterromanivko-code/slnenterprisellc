const fs   = require('fs');
const path = require('path');

/* ── Knowledge base ── */
function loadKnowledgeBase() {
  // In Netlify production: included_files copies knowledge-base.json next to the function bundle
  // Fallback: two levels up from netlify/functions/ to the project root
  const candidates = [
    path.join(__dirname, 'knowledge-base.json'),
    path.join(__dirname, '../../knowledge-base.json'),
  ];
  for (const p of candidates) {
    try { return JSON.parse(fs.readFileSync(p, 'utf8')); } catch {}
  }
  console.warn('[kb] knowledge-base.json not found');
  return {};
}

function buildSystemPrompt(kb) {
  const services = (kb.services || []).map(s =>
    `- ${s.name}: ${s.price}${s.description ? ' — ' + s.description : ''}${s.options ? ' (' + s.options + ')' : ''}`
  ).join('\n');

  const addons = (kb.addons || []).join(', ');
  const area   = (kb.serviceArea || []).join(', ');
  const faqs   = (kb.faqs || []).map(f => `Q: ${f.q}\nA: ${f.a}`).join('\n\n');
  const promos = (kb.promotions || []).length
    ? 'CURRENT PROMOTIONS:\n' + kb.promotions.map(p => `- ${p}`).join('\n') + '\n\n'
    : '';

  return `You are Alexis, the friendly 24/7 virtual assistant for ${kb.business?.name || 'SLN Enterprise LLC'} — a professional cleaning company based in ${kb.business?.location || 'Seattle, WA'}. You are warm, conversational, and genuinely helpful. You speak like a real person, not a robot.

YOUR JOB:
- Answer questions about services, pricing, availability, and the service area
- Help customers pick the right service for their needs
- Naturally collect their name, phone or email, service type, and property details when they're ready to book or want a quote
- Make them feel taken care of even when the team is asleep

SERVICES & PRICING:
${services}

ADD-ONS (can be added to any service): ${addons}

SERVICE AREA: ${area}

BUSINESS HOURS: ${kb.hours?.weekdays || 'Mon–Fri: 8am – 6pm'} | ${kb.hours?.saturday || 'Sat: 9am – 4pm'} | ${kb.hours?.sunday || 'Sun: By appointment'}

${faqs ? 'FREQUENTLY ASKED QUESTIONS:\n' + faqs + '\n\n' : ''}${promos}CONTACT: ${kb.business?.phone || '(206) 609-9422'} | ${kb.business?.email || 'info@slnenterprisellc.online'}

IMPORTANT RULES:
- Keep responses SHORT — 2 to 4 sentences max unless more detail is genuinely needed
- Be warm and natural. Use contractions. Don't sound like a FAQ page.
- When someone wants to book or get a quote, ask for: their name, best contact (phone or email), what service they need, and the property size or address
- If they share their contact info, let them know the team will reach out to confirm and finalize the booking
- Never invent pricing or policies not listed above
- If asked something you don't know, say "I'll make sure the team follows up on that for you" rather than guessing
- You can use a single emoji occasionally if it fits the tone — don't overdo it

LEAD CAPTURE — CRITICAL:
When you have collected BOTH a customer's name AND their contact info (phone number or email address), silently append this marker at the very end of your response on its own line. Do NOT mention it or explain it to the customer — it is completely invisible to them:
<<LEAD:{"name":"THEIR_NAME","contact":"THEIR_CONTACT","service":"SERVICE_IF_KNOWN","location":"LOCATION_IF_KNOWN","notes":"ANY_OTHER_DETAILS"}>>
Only include JSON fields you actually collected. Omit unknown fields entirely. Never show or mention this marker to the customer.`;
}

/* ── Lead capture → Supabase ── */
const LEAD_REGEX = /<<LEAD:(\{[\s\S]*?\})>>/;

async function saveLead(lead) {
  const supabaseUrl = process.env.SUPABASE_URL;
  const supabaseKey = process.env.SUPABASE_ANON_KEY;
  if (!supabaseUrl || supabaseUrl === 'your_supabase_url_here') return;

  try {
    const res = await fetch(`${supabaseUrl}/rest/v1/leads`, {
      method: 'POST',
      headers: {
        'apikey': supabaseKey,
        'Authorization': `Bearer ${supabaseKey}`,
        'Content-Type': 'application/json',
        'Prefer': 'return=minimal',
      },
      body: JSON.stringify({ ...lead, created_at: new Date().toISOString() }),
    });
    if (!res.ok) console.error('[lead error]', await res.text());
  } catch (err) {
    console.error('[lead save failed]', err.message);
  }
}

/* ── Handler ── */
exports.handler = async (event) => {
  const CORS = {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'Content-Type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };

  if (event.httpMethod === 'OPTIONS') {
    return { statusCode: 204, headers: CORS, body: '' };
  }

  if (event.httpMethod !== 'POST') {
    return { statusCode: 405, body: 'Method Not Allowed' };
  }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) {
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'API key not configured.' }),
    };
  }

  let messages;
  try {
    ({ messages } = JSON.parse(event.body));
  } catch {
    return { statusCode: 400, body: JSON.stringify({ error: 'Invalid request body.' }) };
  }

  const kb           = loadKnowledgeBase();
  const systemPrompt = buildSystemPrompt(kb);

  try {
    const res = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 400,
        system: systemPrompt,
        messages: messages.slice(-20),
      }),
    });

    if (!res.ok) {
      const err = await res.text();
      console.error('Anthropic error:', err);
      return {
        statusCode: 502,
        headers: { ...CORS, 'Content-Type': 'application/json' },
        body: JSON.stringify({ error: 'AI service error. Please try again.' }),
      };
    }

    const data = await res.json();
    let reply = data.content?.[0]?.text ?? "I'm having trouble responding right now. Please call us or fill out the contact form!";

    // Extract lead marker, save to Supabase, strip from reply
    const leadMatch = reply.match(LEAD_REGEX);
    if (leadMatch) {
      try {
        const lead = JSON.parse(leadMatch[1]);
        await saveLead(lead);
      } catch (e) {
        console.error('[lead parse error]', e.message);
      }
      reply = reply.replace(LEAD_REGEX, '').trim();
    }

    return {
      statusCode: 200,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ reply }),
    };
  } catch (err) {
    console.error('Function error:', err);
    return {
      statusCode: 500,
      headers: { ...CORS, 'Content-Type': 'application/json' },
      body: JSON.stringify({ error: 'Something went wrong. Please try again.' }),
    };
  }
};

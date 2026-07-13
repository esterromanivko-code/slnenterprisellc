const http = require('http');
const fs   = require('fs');
const path = require('path');

// Load .env manually (no dotenv dependency needed)
const envPath = path.join(__dirname, '.env');
if (fs.existsSync(envPath)) {
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const [k, ...v] = line.split('=');
    if (k && v.length) process.env[k.trim()] = v.join('=').trim();
  });
}

const PORT = 4201;
const ROOT = __dirname;

const MIME = {
  '.html': 'text/html', '.css': 'text/css', '.js': 'application/javascript',
  '.json': 'application/json', '.png': 'image/png', '.jpg': 'image/jpeg',
  '.svg': 'image/svg+xml', '.ico': 'image/x-icon', '.woff2': 'font/woff2',
};

/* ── Knowledge base ── */
function loadKnowledgeBase() {
  try {
    return JSON.parse(fs.readFileSync(path.join(__dirname, 'knowledge-base.json'), 'utf8'));
  } catch {
    console.warn('[kb] knowledge-base.json not found');
    return {};
  }
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

${faqs ? 'FREQUENTLY ASKED QUESTIONS:\n' + faqs + '\n\n' : ''}${promos}CONTACT: ${kb.business?.phone || '(206) 555-0100'} | ${kb.business?.email || 'info@slnenterprisellc.online'}

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
    if (res.ok) {
      console.log('[lead saved]', lead.name, '|', lead.contact);
    } else {
      console.error('[lead error]', await res.text());
    }
  } catch (err) {
    console.error('[lead save failed]', err.message);
  }
}

/* ── Chat handler ── */
async function handleChat(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');

  if (req.method === 'OPTIONS') { res.writeHead(204); res.end(); return; }
  if (req.method !== 'POST')   { res.writeHead(405); res.end('Method Not Allowed'); return; }

  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey || apiKey === 'paste_your_key_here') {
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'ANTHROPIC_API_KEY not set in .env file' }));
    return;
  }

  let body = '';
  for await (const chunk of req) body += chunk;

  let messages;
  try { ({ messages } = JSON.parse(body)); }
  catch { res.writeHead(400); res.end('Bad request'); return; }

  const kb           = loadKnowledgeBase();
  const systemPrompt = buildSystemPrompt(kb);

  try {
    const upstream = await fetch('https://api.anthropic.com/v1/messages', {
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

    const data = await upstream.json();
    let reply = data.content?.[0]?.text ?? "I'm having a moment — please try again or call us!";

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

    res.writeHead(200, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ reply }));
  } catch (err) {
    console.error('[chat error]', err.message);
    res.writeHead(500, { 'Content-Type': 'application/json' });
    res.end(JSON.stringify({ error: 'Something went wrong. Please try again.' }));
  }
}

/* ── Static file server ── */
function serveFile(req, res) {
  let urlPath = req.url.split('?')[0];
  if (urlPath === '/') urlPath = '/index.html';

  const filePath = path.join(ROOT, urlPath);
  const ext = path.extname(filePath);

  if (!filePath.startsWith(ROOT)) { res.writeHead(403); res.end('Forbidden'); return; }

  fs.readFile(filePath, (err, data) => {
    if (err) { res.writeHead(404); res.end('Not found'); return; }
    res.writeHead(200, { 'Content-Type': MIME[ext] || 'application/octet-stream' });
    res.end(data);
  });
}

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/chat')) return handleChat(req, res);
  serveFile(req, res);
});

server.listen(PORT, () => {
  console.log(`\n✦ SLN Enterprise dev server running`);
  console.log(`  Site:  http://localhost:${PORT}`);
  console.log(`  Chat:  http://localhost:${PORT}/api/chat`);
  const key = process.env.ANTHROPIC_API_KEY;
  console.log(`  AI:    ${(!key || key === 'paste_your_key_here') ? '⚠️  API key not set' : '✅ API key loaded'}`);
  const sbUrl = process.env.SUPABASE_URL;
  console.log(`  DB:    ${(!sbUrl || sbUrl === 'your_supabase_url_here') ? '⚠️  Supabase not configured yet' : '✅ Supabase connected'}`);
  console.log('');
});

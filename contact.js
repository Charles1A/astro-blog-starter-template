/**
 * Cloudflare Pages Function — /contact
 * Receives form JSON, sends email via Resend API.
 *
 * Environment variable required (set in Cloudflare Pages → Settings → Environment Variables):
 *   RESEND_API_KEY  — your Resend API key (starts with "re_")
 *
 * The "from" address must be a verified domain in your Resend account.
 * Once firesparkanalytics.com is verified in Resend, update FROM_ADDRESS below.
 */

const TO_ADDRESS   = 'hello@firesparkanalytics.com';
const FROM_ADDRESS = 'website@firesparkanalytics.com'; // must be verified in Resend
const FROM_NAME    = 'Fire Spark Analytics Website';
const RESEND_URL   = 'https://api.resend.com/emails';

export async function onRequestPost(context) {
  const { request, env } = context;

  // ── CORS pre-flight (just in case) ───────────────────
  const headers = {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
  };

  // ── Parse body ───────────────────────────────────────
  let body;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400, headers });
  }

  const { name, email, business, interest, message } = body;

  if (!name || !email) {
    return new Response(JSON.stringify({ error: 'Name and email are required.' }), { status: 422, headers });
  }

  // Basic email format check
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email address.' }), { status: 422, headers });
  }

  // ── Build email ──────────────────────────────────────
  const subject = `New enquiry from ${name}${business ? ` (${business})` : ''}`;

  const textBody = [
    `Name:     ${name}`,
    `Email:    ${email}`,
    `Business: ${business || '—'}`,
    `Interest: ${interest || '—'}`,
    '',
    'Message:',
    message || '(none provided)',
  ].join('\n');

  const htmlBody = `
    <table style="font-family:sans-serif;font-size:15px;color:#2d2d2d;max-width:600px">
      <tr><td style="padding:0 0 6px"><strong>Name:</strong> ${esc(name)}</td></tr>
      <tr><td style="padding:0 0 6px"><strong>Email:</strong> <a href="mailto:${esc(email)}">${esc(email)}</a></td></tr>
      <tr><td style="padding:0 0 6px"><strong>Business:</strong> ${esc(business || '—')}</td></tr>
      <tr><td style="padding:0 0 16px"><strong>Primary interest:</strong> ${esc(interest || '—')}</td></tr>
      <tr><td style="padding:12px;background:#f5f5f0;border-left:3px solid #F97316;border-radius:0 4px 4px 0">
        ${esc(message || '(no message provided)').replace(/\n/g, '<br>')}
      </td></tr>
    </table>
  `;

  // ── Call Resend ──────────────────────────────────────
  const apiKey = env.RESEND_API_KEY;
  console.log('[contact] Handler invoked.');
  console.log('[contact] API key present:', !!apiKey);
  console.log('[contact] API key prefix:', apiKey ? apiKey.slice(0, 6) : 'MISSING');

  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY is not set — aborting.');
    return new Response(JSON.stringify({ error: 'Server configuration error.' }), { status: 500, headers });
  }

  const payload = {
    from:     `${FROM_NAME} <${FROM_ADDRESS}>`,
    to:       [TO_ADDRESS],
    reply_to: email,
    subject,
    text:     textBody,
    html:     htmlBody,
  };
  console.log('[contact] Sending to Resend. From:', payload.from, '/ To:', payload.to, '/ Subject:', payload.subject);

  let resendRes;
  try {
    resendRes = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(payload),
    });
  } catch (err) {
    console.error('[contact] fetch() to Resend threw an exception:', err.message, err.stack);
    return new Response(JSON.stringify({ error: 'Failed to reach email service.', detail: err.message }), { status: 502, headers });
  }

  console.log('[contact] Resend HTTP status:', resendRes.status);

  const resendBody = await resendRes.text();
  console.log('[contact] Resend response body:', resendBody);

  if (!resendRes.ok) {
    let parsed = {};
    try { parsed = JSON.parse(resendBody); } catch {}
    console.error('[contact] Resend rejected the request. Status:', resendRes.status, 'Body:', resendBody);
    return new Response(
      JSON.stringify({ error: 'Email service rejected the request.', detail: parsed.message || resendBody }),
      { status: 502, headers }
    );
  }

  console.log('[contact] Email sent successfully.');
  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
}

// Handle OPTIONS pre-flight
export async function onRequestOptions() {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
}

// Simple HTML escaping to prevent XSS in the email body
function esc(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

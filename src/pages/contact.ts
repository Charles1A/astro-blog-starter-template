// src/pages/contact.ts
// Astro API endpoint — handles contact form POST requests.
// Astro + @astrojs/cloudflare compiles this into a Cloudflare Worker route.
//
// Environment variable required (Cloudflare Pages → Settings → Environment Variables):
//   RESEND_API_KEY  — your Resend API key (starts with "re_")

export const prerender = false;

import type { APIRoute } from 'astro';

const TO_ADDRESS   = 'hello@firesparkanalytics.com';
const FROM_ADDRESS = 'website@firesparkanalytics.com';
const FROM_NAME    = 'Fire Spark Analytics Website';
const RESEND_URL   = 'https://api.resend.com/emails';

function esc(str: string): string {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

const headers = {
  'Content-Type': 'application/json',
  'Access-Control-Allow-Origin': '*',
};

export const POST: APIRoute = async ({ request, locals }) => {
  // Access env via Cloudflare runtime locals
  const env = (locals as any).runtime?.env ?? (locals as any).env ?? {};
  const apiKey: string | undefined = env.RESEND_API_KEY;

  console.log('[contact] Handler invoked.');
  console.log('[contact] API key present:', !!apiKey);
  console.log('[contact] API key prefix:', apiKey ? apiKey.slice(0, 6) : 'MISSING');

  // Parse body
  let body: Record<string, string>;
  try {
    body = await request.json();
  } catch {
    return new Response(JSON.stringify({ error: 'Invalid request body.' }), { status: 400, headers });
  }

  const { name, email, business, interest, message } = body;

  if (!name || !email) {
    return new Response(JSON.stringify({ error: 'Name and email are required.' }), { status: 422, headers });
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return new Response(JSON.stringify({ error: 'Invalid email address.' }), { status: 422, headers });
  }

  if (!apiKey) {
    console.error('[contact] RESEND_API_KEY is not set.');
    return new Response(JSON.stringify({ error: 'Server configuration error.' }), { status: 500, headers });
  }

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

  let resendRes: Response;
  try {
    resendRes = await fetch(RESEND_URL, {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        from:     `${FROM_NAME} <${FROM_ADDRESS}>`,
        to:       [TO_ADDRESS],
        reply_to: email,
        subject,
        text:     textBody,
        html:     htmlBody,
      }),
    });
  } catch (err: any) {
    console.error('[contact] fetch() to Resend threw:', err.message);
    return new Response(
      JSON.stringify({ error: 'Failed to reach email service.', detail: err.message }),
      { status: 502, headers }
    );
  }

  console.log('[contact] Resend HTTP status:', resendRes.status);
  const resendBody = await resendRes.text();
  console.log('[contact] Resend response body:', resendBody);

  if (!resendRes.ok) {
    let parsed: any = {};
    try { parsed = JSON.parse(resendBody); } catch {}
    return new Response(
      JSON.stringify({ error: 'Email service rejected the request.', detail: parsed.message || resendBody }),
      { status: 502, headers }
    );
  }

  return new Response(JSON.stringify({ ok: true }), { status: 200, headers });
};

// Handle OPTIONS preflight
export const OPTIONS: APIRoute = async () => {
  return new Response(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
  });
};

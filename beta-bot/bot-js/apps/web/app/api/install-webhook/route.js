export async function GET(req) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  if (!token || !secret) return new Response('Missing env', { status: 500 });
  const url = new URL(req.url);
  // Build https base from request
  const base = `${url.protocol}//${url.host}`;
  const hookUrl = `${base}/api/telegram`;
  try {
    const res = await fetch(`https://api.telegram.org/bot${token}/setWebhook`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ url: hookUrl, secret_token: secret, drop_pending_updates: true })
    });
    const data = await res.json();
    return new Response(`setWebhook: ${JSON.stringify(data)}`);
  } catch (e) {
    return new Response('Error setting webhook', { status: 500 });
  }
}


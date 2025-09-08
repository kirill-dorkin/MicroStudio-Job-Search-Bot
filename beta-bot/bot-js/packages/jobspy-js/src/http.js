import axios from 'axios';
import { HttpsProxyAgent } from 'https-proxy-agent';
import { HttpProxyAgent } from 'http-proxy-agent';

const UAS = [
  // Modern Chrome desktop variations
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125 Safari/537.36',
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 13_5) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/17.2 Safari/605.1.15',
  'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124 Safari/537.36',
];

function pickUA(attempt = 0) {
  const i = Math.min(attempt, UAS.length - 1);
  return UAS[i];
}

function sleep(ms) { return new Promise(r => setTimeout(r, ms)); }

function isBotBlock(html, status) {
  if (status === 429) return true;
  const t = String(html || '').toLowerCase();
  return (
    t.includes('captcha') ||
    t.includes('unusual traffic') ||
    t.includes('verify you are a human') ||
    t.includes('access denied') ||
    t.includes('pardon our interruption')
  );
}

function pickProxy(url, attempt) {
  const env = process.env.PROXY_URLS || process.env.PROXY_URL || '';
  if (!env) return null;
  const list = env.split(',').map(s => s.trim()).filter(Boolean);
  if (!list.length) return null;
  const idx = Math.floor(Math.random() * list.length);
  const proxyUrl = list[idx];
  try {
    const u = new URL(url);
    if (u.protocol === 'http:') return new HttpProxyAgent(proxyUrl);
    return new HttpsProxyAgent(proxyUrl);
  } catch {
    return null;
  }
}

const DEBUG = !!process.env.JOBSPY_DEBUG;
const PER_HOST_MS = process.env.JOBSPY_PER_HOST_INTERVAL_MS ? parseInt(process.env.JOBSPY_PER_HOST_INTERVAL_MS, 10) : 200;
const _lastByHost = new Map();

export async function fetchHtml(url, { timeout = 3000, headers = {}, maxAttempts = 3, lang = 'en-US,en;q=0.9' } = {}) {
  let lastErr = null;
  for (let attempt = 0; attempt < maxAttempts; attempt++) {
    const ua = pickUA(attempt);
    const jitter = 200 + Math.floor(Math.random() * 300);
    // small pre-delay every attempt to avoid burst
    const pre = (process.env.JOBSPY_PREDELAY_MS ? parseInt(process.env.JOBSPY_PREDELAY_MS, 10) : 80) + Math.floor(Math.random() * 120);
    await sleep(pre + (attempt > 0 ? attempt * 300 + jitter : 0));
    try {
      const agent = pickProxy(url, attempt);
      if (DEBUG) console.log(`[jobspy] GET ${url} (attempt ${attempt+1}/${maxAttempts}${agent ? ' via proxy' : ''})`);
      // Per-host throttle
      try {
        const u = new URL(url);
        const host = u.host;
        const last = _lastByHost.get(host) || 0;
        const now = Date.now();
        const need = PER_HOST_MS - (now - last);
        if (need > 0) await sleep(need + Math.floor(Math.random() * 50));
      } catch {}
      const res = await axios.get(url, {
        headers: {
          'User-Agent': ua,
          'Accept-Language': lang,
          'Cache-Control': 'no-cache',
          Pragma: 'no-cache',
          ...headers,
        },
        timeout,
        httpAgent: agent || undefined,
        httpsAgent: agent || undefined,
        proxy: false,
        validateStatus: s => s >= 200 && s < 400,
      });
      try { const u = new URL(url); _lastByHost.set(u.host, Date.now()); } catch {}
      if (isBotBlock(res.data, res.status)) {
        lastErr = new Error('bot_blocked');
        continue;
      }
      return String(res.data || '');
    } catch (e) {
      lastErr = e;
      try { const u = new URL(url); _lastByHost.set(u.host, Date.now()); } catch {}
      continue;
    }
  }
  if (lastErr) throw lastErr;
  return '';
}

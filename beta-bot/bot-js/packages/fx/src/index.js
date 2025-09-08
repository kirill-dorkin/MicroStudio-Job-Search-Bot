import axios from 'axios';

const FX_URL = 'https://api.exchangerate.host/latest';

export async function fetchRates(base = 'USD') {
  const b = String(base || 'USD').toUpperCase();
  try {
    const res = await axios.get(FX_URL, { params: { base: b }, timeout: 8000 });
    const data = res.data || {};
    const rates = data.rates || {};
    const map = {};
    for (const [k, v] of Object.entries(rates)) map[k.toUpperCase()] = Number(v);
    return map;
  } catch {
    return {};
  }
}

export async function ensureRates(user, storage, uid) {
  const base = (user.base_currency || 'USD').toUpperCase();
  const ts = user.fx_ts || 0;
  const now = Math.floor(Date.now() / 1000);
  let rates = user.fx_rates || {};
  if (!rates || Object.keys(rates).length === 0 || now - ts > 24 * 3600) {
    rates = await fetchRates(base);
    if (rates && Object.keys(rates).length) {
      user.fx_rates = rates;
      user.fx_ts = now;
      if (storage && uid) await storage.setUser(uid, user);
    }
  }
  return rates;
}


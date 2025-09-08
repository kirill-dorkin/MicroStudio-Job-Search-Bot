import { scrapeIndeed } from './providers/indeed.js';
import { scrapeZipRecruiter } from './providers/ziprecruiter.js';
import { scrapeGlassdoor } from './providers/glassdoor.js';
import { scrapeGoogle } from './providers/google.js';
import { scrapeLinkedIn } from './providers/linkedin.js';
import { scrapeBayt } from './providers/bayt.js';
import { scrapeNaukri } from './providers/naukri.js';
import { scrapeBDJobs } from './providers/bdjobs.js';

const DEFAULT_SOURCES = [
  'indeed', 'google', 'zip_recruiter', 'glassdoor', 'linkedin'
];

function _str(v) {
  if (v == null) return '';
  return String(v);
}

function canonicalUrl(u) {
  try {
    const p = new URL(u);
    let host = p.host.toLowerCase();
    if (host.startsWith('www.')) host = host.slice(4);
    return `${p.protocol}//${host}${p.pathname}`;
  } catch {
    return '';
  }
}

function toDDMMYYYY(d) {
  const dd = String(d.getDate()).padStart(2, '0');
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const yyyy = d.getFullYear();
  return `${dd}.${mm}.${yyyy}`;
}

function formatDate(raw) {
  if (!raw) return '—';
  const s = String(raw).trim().toLowerCase();
  // iso or yyyy-mm-dd
  const m = s.match(/(\d{4})-(\d{2})-(\d{2})/);
  if (m) return `${m[3]}.${m[2]}.${m[1]}`;
  // relative times
  const now = new Date();
  if (/just posted|today|сегодня/i.test(s)) return toDDMMYYYY(now);
  if (/yesterday|вчера/i.test(s)) { const d = new Date(now); d.setDate(d.getDate()-1); return toDDMMYYYY(d); }
  const dm = s.match(/(\d+)\s*(day|days|d)\s*ago/);
  if (dm) { const d = new Date(now); d.setDate(d.getDate()-parseInt(dm[1],10)); return toDDMMYYYY(d); }
  const hm = s.match(/(\d+)\s*(hour|hours|h|hr)\s*ago/);
  if (hm) { const d = new Date(now.getTime() - parseInt(hm[1],10)*3600*1000); return toDDMMYYYY(d); }
  const wm = s.match(/(\d+)\s*(week|weeks|w)\s*ago/);
  if (wm) { const d = new Date(now); d.setDate(d.getDate()-parseInt(wm[1],10)*7); return toDDMMYYYY(d); }
  const mm = s.match(/(\d+)\s*(month|months|mo)\s*ago/);
  if (mm) { const d = new Date(now); d.setMonth(d.getMonth()-parseInt(mm[1],10)); return toDDMMYYYY(d); }
  const thirty = s.match(/(30\+|\d{1,2})\s*days?\s*ago/);
  if (thirty) { const n = thirty[1]==='30+'?30:parseInt(thirty[1],10); const d = new Date(now); d.setDate(d.getDate()-n); return toDDMMYYYY(d); }
  // generic Date.parse
  const t = Date.parse(s);
  if (!Number.isNaN(t)) return toDDMMYYYY(new Date(t));
  return String(raw);
}

function parseSalary(text) {
  if (!text) return { min: null, max: null, currency: '', interval: '' };
  const t = String(text).trim();
  // currency detection
  const curSym = (t.match(/[€£$₹]|A\$|C\$/) || [])[0] || '';
  let currency = '';
  if (curSym === '$') currency = 'USD';
  else if (curSym === '€') currency = 'EUR';
  else if (curSym === '£') currency = 'GBP';
  else if (curSym === '₹') currency = 'INR';
  else if (curSym === 'A$') currency = 'AUD';
  else if (curSym === 'C$') currency = 'CAD';
  currency = currency || (t.match(/\b(USD|EUR|GBP|AUD|CAD|INR|AED)\b/i) || [])[0]?.toUpperCase() || '';
  // interval
  let interval = 'yearly';
  if (/per\s*hour|hourly|\bhour\b|\/hr|\bphr\b/i.test(t)) interval = 'hourly';
  else if (/per\s*day|daily|\bday\b|\/day/i.test(t)) interval = 'daily';
  else if (/per\s*month|monthly|\bmo(nth)?\b|\/mo/i.test(t)) interval = 'monthly';
  else if (/per\s*week|weekly|\bweek\b|\/wk/i.test(t)) interval = 'weekly';
  else if (/per\s*year|ann(ual|ually)|\byr\b|yearly|\/yr|pa\b|per\s*annum/i.test(t)) interval = 'yearly';
  // number parsing (US/EU formats, k/lac/lakh/lpa)
  const normalizeNum = (s) => {
    if (!s) return null;
    let v = s.toLowerCase().replace(/[,\s]/g, '');
    // European thousand separator
    if (/\d+\.\d{3}(?:\.\d{3})*/.test(v) && !/\d+\.\d{1,2}$/.test(v)) v = v.replace(/\./g, '');
    // 50k → 50000
    if (/k$/.test(v)) v = String(parseFloat(v) * 1000);
    // 10l, 10lac, 10lakh, 10lpa → 1,000,000
    if (/(l|lac|lakh|lpa)$/.test(v)) v = String(parseFloat(v) * 100000);
    const n = parseInt(v, 10);
    return Number.isNaN(n) ? null : n;
  };
  const mRange = t.match(/(\d+[\d.,]*\s*(?:k|lac|lakh|l|lpa)?)[\s\-–—to]+(\d+[\d.,]*\s*(?:k|lac|lakh|l|lpa)?)/i);
  const mSingle = t.match(/(\d+[\d.,]*\s*(?:k|lac|lakh|l|lpa)?)/i);
  let min = null, max = null;
  if (mRange) {
    min = normalizeNum(mRange[1]);
    max = normalizeNum(mRange[2]);
  } else if (mSingle) {
    min = normalizeNum(mSingle[1]);
    max = null;
  }
  return { min, max, currency, interval };
}

async function mapLimit(items, limit, fn) {
  const ret = [];
  let i = 0;
  async function worker() {
    while (i < items.length) {
      const idx = i++;
      ret[idx] = await fn(items[idx], idx);
    }
  }
  const workers = Array.from({ length: Math.min(limit, items.length) }, () => worker());
  await Promise.all(workers);
  return ret;
}

export async function scrape_jobs({
  site_name = DEFAULT_SOURCES,
  search_term,
  location,
  distance = 50,
  is_remote,
  job_type,
  hours_old,
  results_wanted = 25,
  country_indeed = 'usa',
  offset = 0,
  request_timeout = 3000,
  scrape_timeout = 8000
} = {}) {
  const sources = Array.isArray(site_name) ? site_name : [site_name];
  const fns = sources.map((s) => async () => {
    try {
      if (s === 'indeed') return await scrapeIndeed({ search_term, location, hours_old, offset, country_indeed, distance }, request_timeout);
      if (s === 'zip_recruiter') return await scrapeZipRecruiter({ search_term, location, offset }, request_timeout);
      if (s === 'glassdoor') return await scrapeGlassdoor({ search_term, location, offset }, request_timeout);
      if (s === 'google') return await scrapeGoogle({ search_term, location, offset }, request_timeout);
      if (s === 'linkedin') return await scrapeLinkedIn({ search_term, location, offset }, request_timeout);
      if (s === 'bayt') return await scrapeBayt({ search_term, location, offset }, request_timeout);
      if (s === 'naukri') return await scrapeNaukri({ search_term, location, offset }, request_timeout);
      if (s === 'bdjobs') return await scrapeBDJobs({ search_term, location, offset }, request_timeout);
      return [];
    } catch (_) {
      return [];
    }
  });
  const settled = await mapLimit(fns, 3, (fn) => fn());
  const rows = settled.flat().filter(Boolean);
  // Normalize & dedupe
  const norm = rows.map(r => {
    const job_url = canonicalUrl(r.job_url_raw || r.job_url || '');
    const descr = _str(r.description_raw || '').slice(0, 280);
    // derive salary if present
    let min_amount = r.min_amount ?? null;
    let max_amount = r.max_amount ?? null;
    let currency = _str(r.currency || '');
    let interval = _str(r.interval || '');
    if ((!min_amount && !max_amount) && (r.salary_text || descr)) {
      const s = parseSalary(r.salary_text || descr);
      min_amount = s.min; max_amount = s.max; currency = currency || s.currency; interval = interval || s.interval;
    }
    let salary = '—';
    if (min_amount || max_amount) {
      if (min_amount && max_amount) salary = `${min_amount}–${max_amount} ${currency}/${interval}`;
      else salary = `${min_amount || max_amount} ${currency}/${interval}`;
    }
    // heuristics for remote and job_type if missing
    let remote_bool = typeof r.is_remote === 'boolean' ? r.is_remote : null;
    const locStr = _str(r.location || '').toLowerCase();
    const allTxt = `${_str(r.title)} ${locStr} ${descr}`.toLowerCase();
    if (remote_bool === null) {
      if (/(remote|удалён|удален|home|wfh|work\s*from\s*home)/i.test(allTxt)) remote_bool = true;
      else if (/(onsite|on[-\s]?site|офис|гибрид|hybrid)/i.test(allTxt)) remote_bool = false;
    }
    let job_type = _str(r.job_type) || '';
    if (!job_type) {
      if (/intern(ship)?|стаж/i.test(allTxt)) job_type = 'internship';
      else if (/contract|контракт/i.test(allTxt)) job_type = 'contract';
      else if (/part[-\s]?time|непол/i.test(allTxt)) job_type = 'parttime';
      else if (/full[-\s]?time|полный/i.test(allTxt)) job_type = 'fulltime';
    }
    return {
      title: _str(r.title) || '—',
      company: _str(r.company) || '—',
      location: _str(r.location) || '—',
      site: _str(r.site) || '—',
      date_posted: formatDate(r.date_posted_raw),
      job_type: job_type || '—',
      remote: remote_bool === true ? 'Удалённо' : (remote_bool === false ? 'Офис/Гибрид' : '—'),
      remote_bool,
      salary,
      min_amount,
      max_amount,
      currency,
      interval,
      job_url,
      job_url_raw: r.job_url_raw || job_url,
      description: descr
    };
  });
  const seen = new Set();
  const dedup = [];
  for (const r of norm) {
    const key = r.job_url || `${r.title}|${r.company}|${r.location}`;
    if (key && !seen.has(key)) {
      seen.add(key);
      dedup.push(r);
    }
    if (dedup.length >= results_wanted) break;
  }
  return dedup;
}

export const DEFAULT_SOURCES_JS = DEFAULT_SOURCES;

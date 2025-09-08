import cheerio from 'cheerio';
import { fetchHtml } from '../http.js';

function buildUrl({ search_term, location }) {
  const q = [search_term || '', 'jobs', location ? `in ${location}` : ''].filter(Boolean).join(' ');
  const params = new URLSearchParams({ q });
  return `https://www.google.com/search?${params.toString()}`;
}

export async function scrapeGoogle(opts, timeBudgetMs = 3000) {
  const url = buildUrl(opts);
  try {
    const html = await fetchHtml(url, { timeout: timeBudgetMs, lang: 'en-US,en;q=0.9' });
    const $ = cheerio.load(html);
    const jobs = [];
    // Parse generic search results as a fallback when jobs module not accessible
    // Common structure: div.yuRUbf > a[href]
    $('div.yuRUbf > a').each((_, el) => {
      const $a = $(el);
      const title = $a.find('h3').text().trim() || $a.text().trim();
      let href = $a.attr('href') || '';
      if (!href) return;
      const m = href.match(/\/url\?q=([^&]+)/);
      if (m) href = decodeURIComponent(m[1]);
      const company = '';
      const location = opts.location || '';
      jobs.push({ title, company, location, site: 'google', job_url_raw: href, date_posted_raw: '', description_raw: '', job_type: '', is_remote: null, min_amount: null, max_amount: null, currency: '', interval: '' });
    });
    if (jobs.length === 0) {
      $('div.g h3').each((_, el) => {
        const $h = $(el);
        const title = $h.text().trim();
        const container = $h.closest('a');
        let href = container.attr('href') || '';
        if (!href) return;
        const m = href.match(/\/url\?q=([^&]+)/);
        if (m) href = decodeURIComponent(m[1]);
        const company = '';
        const location = opts.location || '';
        jobs.push({ title, company, location, site: 'google', job_url_raw: href, date_posted_raw: '', description_raw: '', job_type: '', is_remote: null, min_amount: null, max_amount: null, currency: '', interval: '' });
      });
    }
    return jobs;
  } catch (_) {
    return [];
  }
}

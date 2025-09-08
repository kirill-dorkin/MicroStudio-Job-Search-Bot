import cheerio from 'cheerio';
import { fetchHtml } from '../http.js';

function buildUrl({ search_term, location }) {
  const params = new URLSearchParams();
  if (search_term) params.set('q', search_term);
  if (location) params.set('l', location);
  return `https://www.bayt.com/en/jobs/?${params.toString()}`;
}

export async function scrapeBayt(opts, timeBudgetMs = 3000) {
  const url = buildUrl(opts);
  try {
    const html = await fetchHtml(url, { timeout: timeBudgetMs, lang: 'en-US,en;q=0.9' });
    const $ = cheerio.load(html);
    const jobs = [];
    $('div.has-pointer, div.card-content').each((_, el) => {
      const $el = $(el);
      const title = $el.find('h2 a, a.job-title').first().text().trim();
      const company = $el.find('bdi, .company-name').first().text().trim();
      const location = $el.find('.location, .job-location').first().text().trim();
      let href = $el.find('h2 a, a.job-title').first().attr('href') || '';
      if (href && href.startsWith('/')) href = 'https://www.bayt.com' + href;
      const descr = $el.find('p').first().text().trim();
      if (!title || !href) return;
      jobs.push({
        title, company, location,
        site: 'bayt',
        job_url_raw: href,
        date_posted_raw: '',
        description_raw: descr,
        job_type: '', is_remote: null,
        min_amount: null, max_amount: null, currency: '', interval: ''
      });
    });
    return jobs;
  } catch (_) {
    return [];
  }
}

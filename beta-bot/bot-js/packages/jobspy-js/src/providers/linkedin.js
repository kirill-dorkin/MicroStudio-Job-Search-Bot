import cheerio from 'cheerio';
import { fetchHtml } from '../http.js';

function buildUrl({ search_term, location, offset = 0 }) {
  const params = new URLSearchParams();
  if (search_term) params.set('keywords', search_term);
  if (location) params.set('location', location);
  if (offset) params.set('start', String(offset));
  return `https://www.linkedin.com/jobs/search/?${params.toString()}`;
}

export async function scrapeLinkedIn(opts, timeBudgetMs = 3000) {
  const url = buildUrl(opts);
  try {
    const html = await fetchHtml(url, { timeout: timeBudgetMs, lang: 'en-US,en;q=0.9' });
    const $ = cheerio.load(html);
    const jobs = [];
    let count = 0;
    $('li div.base-card').each((_, el) => {
      const $el = $(el);
      const title = $el.find('h3.base-search-card__title').text().trim();
      const company = $el.find('h4.base-search-card__subtitle').text().trim();
      const location = $el.find('span.job-search-card__location').text().trim();
      let href = $el.find('a.base-card__full-link').attr('href') || '';
      const date = $el.find('time').attr('datetime') || '';
      const descr = $el.find('p.job-card-container__snippet').text().trim();
      jobs.push({
        title, company, location,
        site: 'linkedin',
        job_url_raw: href,
        date_posted_raw: date,
        description_raw: descr,
        job_type: '', is_remote: null,
        min_amount: null, max_amount: null, currency: '', interval: ''
      });
      count++;
    });
    if (count === 0) {
      $('li.jobs-search-results__list-item').each((_, el) => {
        const $el = $(el);
        const title = $el.find('a.base-card__full-link').text().trim() || $el.find('h3').text().trim();
        const company = $el.find('.base-search-card__subtitle a, .base-search-card__subtitle').first().text().trim();
        const location = $el.find('.job-search-card__location').first().text().trim();
        let href = $el.find('a.base-card__full-link').attr('href') || '';
        const date = $el.find('time').attr('datetime') || '';
        if (!title || !href) return;
        jobs.push({ title, company, location, site: 'linkedin', job_url_raw: href, date_posted_raw: date, description_raw: '', job_type: '', is_remote: null, min_amount: null, max_amount: null, currency: '', interval: '' });
      });
    }
    return jobs;
  } catch (_) {
    return [];
  }
}

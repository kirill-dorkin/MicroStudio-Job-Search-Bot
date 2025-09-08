import cheerio from 'cheerio';
import { fetchHtml } from '../http.js';

function buildUrl({ search_term, location }) {
  const params = new URLSearchParams();
  if (search_term) params.set('txtKeyword', search_term);
  if (location) params.set('l', location);
  return `https://www.bdjobs.com/jobsearch.asp?${params.toString()}`;
}

export async function scrapeBDJobs(opts, timeBudgetMs = 3000) {
  const url = buildUrl(opts);
  try {
    const html = await fetchHtml(url, { timeout: timeBudgetMs, lang: 'en-US,en;q=0.9' });
    const $ = cheerio.load(html);
    const jobs = [];
    $('div.job-card, .job-card').each((_, el) => {
      const $el = $(el);
      const title = $el.find('a').first().text().trim();
      let href = $el.find('a').first().attr('href') || '';
      if (href && href.startsWith('/')) href = 'https://www.bdjobs.com' + href;
      const company = $el.find('.company-name').first().text().trim();
      const location = $el.find('.job-location').first().text().trim();
      const descr = $el.find('p').text().trim();
      if (!title || !href) return;
      jobs.push({
        title, company, location,
        site: 'bdjobs',
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

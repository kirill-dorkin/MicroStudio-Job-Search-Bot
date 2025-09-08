import cheerio from 'cheerio';
import { fetchHtml } from '../http.js';

function buildUrl({ search_term, location }) {
  const q = (search_term || '').trim().replace(/\s+/g, '-');
  const loc = (location || '').trim().replace(/\s+/g, '-');
  if (q && loc) return `https://www.naukri.com/${q}-jobs-in-${loc}`;
  if (q) return `https://www.naukri.com/${q}-jobs`;
  return `https://www.naukri.com/jobs-in-${loc}`;
}

export async function scrapeNaukri(opts, timeBudgetMs = 3000) {
  const url = buildUrl(opts);
  try {
    const html = await fetchHtml(url, { timeout: timeBudgetMs, lang: 'en-IN,en;q=0.9' });
    const $ = cheerio.load(html);
    const jobs = [];
    $('article.jobTuple').each((_, el) => {
      const $el = $(el);
      const title = $el.find('a.title').text().trim();
      const company = $el.find('a.subTitle').text().trim();
      const location = $el.find('li.location').text().trim();
      let href = $el.find('a.title').attr('href') || '';
      const descr = $el.find('div.job-description').text().trim();
      if (!title || !href) return;
      jobs.push({
        title, company, location,
        site: 'naukri',
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

import cheerio from 'cheerio';
import { fetchHtml } from '../http.js';

function buildUrl({ search_term, location, offset = 0 }) {
  const params = new URLSearchParams();
  if (search_term) params.set('search', search_term);
  if (location) params.set('location', location);
  if (offset) params.set('page', String(Math.floor(offset / 20) + 1));
  return `https://www.ziprecruiter.com/candidate/search?${params.toString()}`;
}

export async function scrapeZipRecruiter(opts, timeBudgetMs = 3000) {
  const url = buildUrl(opts);
  try {
    const html = await fetchHtml(url, { timeout: timeBudgetMs, lang: 'en-US,en;q=0.9' });
    const $ = cheerio.load(html);
    const jobs = [];
    $('article.job_result').each((_, el) => {
      const $el = $(el);
      const title = $el.find('a.just_job_title').text().trim();
      const company = $el.find('.t_org_link').text().trim();
      const location = $el.find('.t_location').text().trim();
      const job_url = 'https://www.ziprecruiter.com' + ($el.find('a.result_job_link').attr('href') || '');
      const date = $el.find('time').attr('datetime') || '';
      const salaryText = $el.find('.salary').text().trim() || $el.find('.t_salary').text().trim();
      jobs.push({
        title, company, location,
        site: 'zip_recruiter',
        job_url_raw: job_url,
        date_posted_raw: date,
        description_raw: $el.find('.job_snippet').text().trim(),
        job_type: '',
        is_remote: null,
        min_amount: null,
        max_amount: null,
        currency: '',
        interval: '',
        salary_text: salaryText
      });
    });
    return jobs;
  } catch (_) {
    return [];
  }
}

import cheerio from 'cheerio';
import { fetchHtml } from '../http.js';

function buildUrl({ search_term, location, hours_old, offset = 0, country_indeed = 'usa', distance }) {
  const baseByCountry = {
    usa: 'https://www.indeed.com/jobs',
    uk: 'https://uk.indeed.com/jobs',
    india: 'https://in.indeed.com/jobs',
    germany: 'https://de.indeed.com/jobs'
  };
  const base = baseByCountry[country_indeed] || baseByCountry.usa;
  const params = new URLSearchParams();
  if (search_term) params.set('q', search_term);
  if (location) params.set('l', location);
  if (hours_old) params.set('fromage', String(Math.max(1, Math.min(30, hours_old))));
  if (offset) params.set('start', String(offset));
  if (distance) params.set('radius', String(distance));
  return `${base}?${params.toString()}`;
}

export async function scrapeIndeed(opts, timeBudgetMs = 3000) {
  const url = buildUrl(opts);
  try {
    const html = await fetchHtml(url, { timeout: timeBudgetMs, lang: 'en-US,en;q=0.9' });
    const $ = cheerio.load(html);
    const jobs = [];
    let found = 0;
    $('a.tapItem').each((_, el) => {
      const $el = $(el);
      const title = $el.find('h2.jobTitle').text().trim();
      const company = $el.find('.companyName').text().trim();
      const location = $el.find('.companyLocation').text().trim();
      let job_url = $el.attr('href') || '';
      if (job_url && job_url.startsWith('/')) job_url = 'https://www.indeed.com' + job_url;
      const date = $el.find('.date').text().trim();
      const salaryText = $el.find('.salary-snippet-container, .salary-snippet').text().trim();
      const snippet = $el.find('.job-snippet').text().trim();
      jobs.push({
        title, company, location,
        site: 'indeed',
        job_url_raw: job_url,
        date_posted_raw: date,
        description_raw: snippet,
        job_type: '',
        is_remote: null,
        min_amount: null,
        max_amount: null,
        currency: '',
        interval: '',
        salary_text: salaryText
      });
      found++;
    });
    if (found === 0) {
      // Fallback markup
      $('div.job_seen_beacon').each((_, el) => {
        const $el = $(el);
        const title = $el.find('h2.jobTitle').text().trim();
        const company = $el.find('span.companyName').text().trim();
        const location = $el.find('div.companyLocation').text().trim();
        let job_url = $el.find('a').attr('href') || '';
        if (job_url && job_url.startsWith('/')) job_url = 'https://www.indeed.com' + job_url;
        const date = $el.find('span.date').text().trim();
        const salaryText = $el.find('.salary-snippet-container, .salary-snippet').text().trim();
        const snippet = $el.find('.job-snippet').text().trim();
        if (!title || !job_url) return;
        jobs.push({
          title, company, location,
          site: 'indeed',
          job_url_raw: job_url,
          date_posted_raw: date,
          description_raw: snippet,
          job_type: '',
          is_remote: null,
          min_amount: null,
          max_amount: null,
          currency: '',
          interval: '',
          salary_text: salaryText
        });
      });
    }
    return jobs;
  } catch (_) {
    return [];
  }
}

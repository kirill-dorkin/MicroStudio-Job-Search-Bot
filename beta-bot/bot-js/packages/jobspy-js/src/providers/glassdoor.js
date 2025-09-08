import cheerio from 'cheerio';
import { fetchHtml } from '../http.js';

function buildUrl({ search_term, location }) {
  const params = new URLSearchParams();
  if (search_term) params.set('sc.keyword', search_term);
  if (location) params.set('locKeyword', location);
  return `https://www.glassdoor.com/Job/jobs.htm?${params.toString()}`;
}

export async function scrapeGlassdoor(opts, timeBudgetMs = 3000) {
  const url = buildUrl(opts);
  try {
    const html = await fetchHtml(url, { timeout: timeBudgetMs, lang: 'en-US,en;q=0.9' });
    const $ = cheerio.load(html);
    const jobs = [];
    // Glassdoor markup varies; try common selectors
    let c = 0;
    $('li.react-job-listing, article.jobCard').each((_, el) => {
      const $el = $(el);
      const title = $el.find('a.jobLink, a[href*="/partner/jobListing.htm"]').first().text().trim() || $el.find('a').first().text().trim();
      const company = $el.find('.jobEmpolyerName, .employerName, .job-search-1b3m2ps').first().text().trim() || $el.find('.job-search-1jg707y').first().text().trim();
      const location = $el.find('.jobLocation, .location, .job-search-1jvlpvd').first().text().trim();
      let href = $el.find('a.jobLink, a[href*="/partner/jobListing.htm"]').first().attr('href') || '';
      if (href && href.startsWith('/')) href = 'https://www.glassdoor.com' + href;
      const descr = $el.find('.job-snippet, .jobDesc').first().text().trim();
      jobs.push({
        title, company, location,
        site: 'glassdoor',
        job_url_raw: href,
        date_posted_raw: '',
        description_raw: descr,
        job_type: '', is_remote: null,
        min_amount: null, max_amount: null, currency: '', interval: ''
      });
      c++;
    });
    if (c === 0) {
      // Alternative selectors
      $('a[data-test="job-link"]').each((_, el) => {
        const $a = $(el);
        const title = $a.text().trim();
        let href = $a.attr('href') || '';
        if (href && href.startsWith('/')) href = 'https://www.glassdoor.com' + href;
        const container = $a.closest('li, article, div');
        const company = container.find('[data-test="employer-short-name"], .employerName').first().text().trim();
        const location = container.find('[data-test="header-location"], .jobLocation').first().text().trim();
        if (!title || !href) return;
        jobs.push({ title, company, location, site: 'glassdoor', job_url_raw: href, date_posted_raw: '', description_raw: '', job_type: '', is_remote: null, min_amount: null, max_amount: null, currency: '', interval: '' });
      });
    }
    return jobs;
  } catch (_) {
    return [];
  }
}

import * as jobspy from '@jobspy/jobspy-js';

export async function GET(req) {
  const url = new URL(req.url);
  const q = url.searchParams.get('q') || '';
  const loc = url.searchParams.get('loc') || '';
  const remote = url.searchParams.get('remote');
  const type = url.searchParams.get('type') || '';
  const hours = url.searchParams.get('hours');
  const offset = parseInt(url.searchParams.get('offset') || '0', 10) || 0;
  const results = parseInt(url.searchParams.get('results') || '20', 10) || 20;
  const dist = parseInt(url.searchParams.get('dist') || '0', 10) || undefined;
  const sources = (url.searchParams.get('sources') || '').split(',').filter(Boolean);
  const country = url.searchParams.get('country') || 'usa';
  const is_remote = remote == null ? undefined : (remote === 'yes' ? true : remote === 'no' ? false : null);
  const hours_old = hours ? parseInt(hours, 10) : undefined;
  const site_name = sources.length ? sources : ['indeed','zip_recruiter','glassdoor','google'];
  try {
    const rows = await jobspy.scrape_jobs({
      site_name,
      search_term: q,
      location: loc,
      distance: dist,
      is_remote,
      job_type: type || undefined,
      results_wanted: results,
      country_indeed: country,
      offset,
      request_timeout: 3000,
      scrape_timeout: 8000
    });
    return Response.json({ ok: true, rows });
  } catch (e) {
    return Response.json({ ok: false, error: 'search_failed' }, { status: 500 });
  }
}

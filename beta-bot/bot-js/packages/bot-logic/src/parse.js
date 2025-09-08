export function parseQuickQuery(text) {
  const filters = {};
  if (!text) return filters;
  const parts = text.trim().split(/\s+/);
  const keywords = [];
  for (const p of parts) {
    if (p.includes(':')) {
      const [k0, v0] = p.split(':', 1);
      const k = k0.toLowerCase();
      const v = p.slice(k.length + 1);
      if (k === 'loc' || k === 'l') filters.location = v;
      else if (k === 'hours' || k === 'h') { const n = parseInt(v, 10); if (!Number.isNaN(n)) filters.hours_old = n; }
      else if (k === 'remote' || k === 'r') {
        const vv = v.toLowerCase();
        filters.remote = vv === 'yes' || vv === 'true' || vv === '1' ? true : vv === 'no' || vv === 'false' || vv === '0' ? false : null;
      }
      else if (k === 'type' || k === 't') filters.job_type = v.toLowerCase();
      else if (k === 'distance' || k === 'dist' || k === 'd') { const n = parseInt(v, 10); if (!Number.isNaN(n)) filters.distance = n; }
      else if (k === 'country' || k === 'c') filters.country_indeed = v.toLowerCase();
      else keywords.push(p);
    } else keywords.push(p);
  }
  if (keywords.length) filters.keywords = keywords.join(' ');
  return filters;
}

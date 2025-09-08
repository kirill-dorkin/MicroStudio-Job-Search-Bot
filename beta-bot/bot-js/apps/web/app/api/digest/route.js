import { createStorage, listUsers } from '@jobspy/storage';
import * as jobspy from '@jobspy/jobspy-js';
import { createBot } from '@jobspy/bot-logic';
import * as texts from '@jobspy/shared-texts';

const storage = createStorage();
let botInstance = null;
function getBot() {
  if (!botInstance) botInstance = createBot({ storage, texts, jobspy });
  return botInstance;
}

export async function GET() {
  const bot = getBot();
  try {
    const ids = await listUsers(storage);
    // Process at most 50 users per run to keep within time limits
    for (const uid of ids.slice(0, 50)) {
      try {
        const u = await storage.getUser(uid);
        const saved = u.saved_searches || [];
        if (!saved.length) continue;
        const country = u.country_indeed || 'usa';
        const srcs = u.sources && u.sources.length ? u.sources : ['indeed','zip_recruiter'];
        for (const s of saved.slice(0, 1)) { // one per run to be safe
          const filters = s.filters || {};
          const rows = await jobspy.scrape_jobs({
            site_name: srcs,
            search_term: filters.keywords,
            location: filters.location,
            results_wanted: 10,
            country_indeed: country,
            request_timeout: 3000,
            scrape_timeout: 8000
          });
          if (!rows.length) continue;
          await bot.api.sendMessage(uid, `Дайджест: ${s.name}`);
          for (const j of rows.slice(0, 5)) {
            await bot.api.sendMessage(uid, `${j.title} — ${j.company} • ${j.location}\n${j.job_url}`, { disable_web_page_preview: true });
          }
          // mark last sent time
          const ss = u.saved_searches.map(x => x.name === s.name ? { ...x, subs: { ...(x.subs||{}), last_ts: Math.floor(Date.now()/1000) } } : x);
          await storage.updateUser(uid, { saved_searches: ss });
        }
      } catch {}
    }
    return new Response('OK');
  } catch (e) {
    return new Response('ERR', { status: 500 });
  }
}

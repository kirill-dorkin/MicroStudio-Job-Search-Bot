import { Bot, InlineKeyboard, InputFile } from 'grammy';
import Papa from 'papaparse';
import { parseQuickQuery } from './parse.js';
import { ensureRates } from '@jobspy/fx';

export function createBot({ storage, texts, jobspy }) {
  const token = process.env.TELEGRAM_BOT_TOKEN;
  if (!token) throw new Error('Set TELEGRAM_BOT_TOKEN');
  const bot = new Bot(token);

  async function getUser(uid) { return storage.getUser(uid); }
  async function updateUser(uid, patch) { return storage.updateUser(uid, patch); }

  function langOf(u) { return (u.lang || 'ru'); }

  function jobsToCsv(rows) {
    const csv = Papa.unparse(rows);
    return Buffer.from(csv, 'utf-8');
  }

  function buildCardText(lang, j) {
    const line1 = `${j.title} — ${j.company} • ${j.location}`;
    const meta = `${j.site} • ${j.date_posted}`;
    const type = `${j.remote} • ${j.job_type}`;
    const sal = `Salary: ${j.salary}`;
    const descr = j.description ? `\n${j.description}` : '';
    return `${line1}\n${meta}\n${type}\n${sal}${descr}`;
  }

  async function runSearchForUser(uid, filters, { limit = 15 } = {}) {
    const u = await getUser(uid);
    const srcs = u.sources && u.sources.length ? u.sources : ['indeed','zip_recruiter'];
    const rows = await jobspy.scrape_jobs({
      site_name: srcs,
      search_term: filters.keywords,
      location: filters.location,
      distance: filters.distance,
      is_remote: filters.remote,
      job_type: filters.job_type,
      hours_old: filters.hours_old,
      results_wanted: limit,
      country_indeed: u.country_indeed || 'usa',
      offset: 0,
      request_timeout: 3000,
      scrape_timeout: 8000
    });
    await storage.updateUser(uid, { last_results: rows, last_filters: filters });
    return rows;
  }

  // /start
  bot.command('start', async (ctx) => {
    const u = await getUser(ctx.from.id);
    const lang = langOf(u);
    await ctx.reply(texts.t(lang, 'greet', ctx.from.first_name || ''));
    const kbLang = new InlineKeyboard().text(texts.label(lang, 'lang_ru'), 'lang:ru').text(texts.label(lang, 'lang_en'), 'lang:en');
    await ctx.reply(texts.t(lang, 'choose_lang'), { reply_markup: kbLang });
  });

  // language selection
  bot.callbackQuery(/^lang:(ru|en)$/, async (ctx) => {
    const uid = ctx.from.id;
    const lng = ctx.match[1];
    await updateUser(uid, { lang: lng });
    const kb = new InlineKeyboard().text(texts.label(lng, 'role_jobseeker'), 'role:jobseeker').text(texts.label(lng, 'role_recruiter'), 'role:recruiter');
    await ctx.editMessageText(texts.t(lng, 'choose_lang'));
    await ctx.reply('Ваша роль?', { reply_markup: kb });
    await ctx.answerCallbackQuery();
  });
  bot.callbackQuery(/^role:(jobseeker|recruiter)$/, async (ctx) => {
    const uid = ctx.from.id;
    const role = ctx.match[1];
    const u = await getUser(uid);
    const lang = langOf(u);
    await updateUser(uid, { role });
    const kb = new InlineKeyboard().text(texts.label(lang, 'yes'), 'notif:on').text(texts.label(lang, 'no'), 'notif:off');
    await ctx.editMessageText('Уведомления включить?');
    await ctx.reply('—', { reply_markup: kb });
    await ctx.answerCallbackQuery();
  });
  bot.callbackQuery(/^notif:(on|off)$/, async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const lang = langOf(u);
    const v = ctx.match[1] === 'on';
    await updateUser(uid, { notifications: v });
    await ctx.editMessageText(v ? texts.label(lang, 'notif_on') : texts.label(lang, 'notif_off'));
    await ctx.reply(texts.t(lang, 'menu'));
    await ctx.reply(texts.t(lang, 'disclaimer'));
    await ctx.answerCallbackQuery();
  });

  // /help
  bot.command('help', async (ctx) => {
    const u = await getUser(ctx.from.id);
    const lang = langOf(u);
    await ctx.reply(texts.t(lang, 'help'));
    await ctx.reply(texts.t(lang, 'menu'));
  });

  // /settings
  bot.command('settings', async (ctx) => {
    const u = await getUser(ctx.from.id);
    const lang = langOf(u);
    const txt = texts.t(lang, 'settings', {
      lang: u.lang,
      role: u.role,
      sources: (u.sources || []).join(', '),
      country: u.country_indeed
    });
    await ctx.reply(txt);
  });

  // /previews toggle web page previews
  bot.command('previews', async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const newVal = !u.previews;
    await updateUser(uid, { previews: newVal });
    await ctx.reply(`Веб-превью: ${newVal ? 'вкл' : 'выкл'}`);
  });

  // /sources
  bot.command('sources', async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const lang = langOf(u);
    const all = [
      ['linkedin','LinkedIn'],['indeed','Indeed'],['google','Google'],['zip_recruiter','ZipRecruiter'],['glassdoor','Glassdoor'],
      ['bayt','Bayt'],['naukri','Naukri'],['bdjobs','BDJobs']
    ];
    const active = new Set(u.sources || []);
    const kb = new InlineKeyboard();
    for (const [key, name] of all) {
      const prefix = active.has(key) ? '✅ ' : '▫️ ';
      kb.text(prefix + name, `src:${key}`).row();
    }
    kb.text('All', 'src:all').text('None', 'src:none').row();
    kb.text('OK', 'src:ok');
    await ctx.reply('Источники:', { reply_markup: kb });
  });
  bot.callbackQuery(/^src:/, async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const cmd = ctx.match.input.split(':')[1];
    let srcs = new Set(u.sources || []);
    if (cmd === 'ok') { await ctx.answerCallbackQuery(); return; }
    if (cmd === 'all') srcs = new Set(['linkedin','indeed','google','zip_recruiter','glassdoor','bayt','naukri','bdjobs']);
    else if (cmd === 'none') srcs = new Set();
    else {
      if (srcs.has(cmd)) srcs.delete(cmd); else srcs.add(cmd);
      if (!srcs.size) srcs = new Set(['indeed','linkedin','google','zip_recruiter','glassdoor']);
    }
    await updateUser(uid, { sources: Array.from(srcs) });
    await ctx.answerCallbackQuery({ text: 'Updated' });
  });

  // /region (next message sets the code)
  bot.command('region', async (ctx) => {
    const uid = ctx.from.id;
    await updateUser(uid, { _await_region: true });
    await ctx.reply('Укажите страну (например: usa, uk, india):');
  });
  bot.on('message:text', async (ctx, next) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    if (u._await_region) {
      const v = (ctx.msg.text || '').trim().toLowerCase();
      await updateUser(uid, { country_indeed: v, _await_region: false });
      await ctx.reply(`Страна сохранена: ${v}`);
      return;
    }
    // Guided search flow
    if (u._search_state) {
      const msg = (ctx.msg.text || '').trim();
      const f = { ...(u.last_filters || {}) };
      if (u._search_state === 'keywords') {
        f.keywords = msg;
        await updateUser(uid, { last_filters: f, _search_state: 'location' });
        await ctx.reply('Локация (например, Berlin). Пропустить — отправьте -');
        return;
      } else if (u._search_state === 'location') {
        if (msg !== '-') f.location = msg;
        await updateUser(uid, { last_filters: f, _search_state: 'type' });
        await ctx.reply('Тип занятости (fulltime/parttime/contract/internship). Пропустить — -');
        return;
      } else if (u._search_state === 'type') {
        if (msg !== '-') f.job_type = msg.toLowerCase();
        await updateUser(uid, { last_filters: f, _search_state: 'remote' });
        await ctx.reply('Удалёнка? (yes/no/any)');
        return;
      } else if (u._search_state === 'remote') {
        const m = msg.toLowerCase();
        f.remote = (m === 'yes') ? true : (m === 'no') ? false : null;
        await updateUser(uid, { last_filters: f, _search_state: 'hours' });
        await ctx.reply('За сколько часов искать? (24/72/168) Пропустить — -');
        return;
      } else if (u._search_state === 'hours') {
        if (msg !== '-') {
          const n = parseInt(msg, 10);
          if (!Number.isNaN(n)) f.hours_old = n;
        }
        await updateUser(uid, { last_filters: f, _search_state: null });
        await ctx.reply('Запускаю поиск…');
        const rows = await runSearchForUser(uid, f, { limit: 15 });
        if (!rows.length) { await ctx.reply('Ничего не найдено'); return; }
        for (const j of rows.slice(0,5)) {
          const kb = new InlineKeyboard().url('Открыть', j.job_url_raw || j.job_url).row().text('В избранное', 'fav:0');
          await ctx.reply(buildCardText((u.lang||'ru'), j), { reply_markup: kb, disable_web_page_preview: !u.previews });
        }
        return;
      }
    }
    await next();
  });

  // /q quick search
  bot.command('search', async (ctx) => {
    // Guided flow
    await updateUser(ctx.from.id, { _search_state: 'keywords', last_filters: {} });
    await ctx.reply('Ключевые слова (например, python developer)');
  });

  bot.command(['q'], async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const lang = langOf(u);
    const raw = ctx.match || '';
    const filters = parseQuickQuery(raw);
    if (!filters.keywords && raw.trim().length === 0) {
      await ctx.reply('Пример: /q python loc:Berlin hours:72 remote:yes');
      return;
    }
    try {
      const rows = await runSearchForUser(uid, filters, { limit: 15 });
      if (!rows.length) {
        await ctx.reply(texts.t(lang, 'no_results'));
        return;
      }
      // send compact cards
      const first = rows.slice(0, 5);
      for (let i = 0; i < first.length; i++) {
        const j = first[i];
        const kb = new InlineKeyboard()
          .url('Открыть', j.job_url_raw || j.job_url).row()
          .text('В избранное', `fav:${i}`).row()
          .text('Похожие', `sim:${i}`).text('Поделиться', `share:${i}`).row()
          .text('Скрыть компанию', `mute:${i}`);
        await ctx.reply(buildCardText(lang, j), { reply_markup: kb, disable_web_page_preview: !u.previews });
      }
      if (rows.length > 5) {
        const kb = new InlineKeyboard().text(texts.label(lang, 'more') || 'More', 'page:2');
        await ctx.reply('Показать больше?', { reply_markup: kb });
      }
      await ctx.reply(texts.t(lang, 'disclaimer'));
    } catch (e) {
      await ctx.reply('Ошибка поиска. Попробуйте изменить запрос.');
    }
  });

  bot.callbackQuery(/^page:/, async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const page = parseInt(ctx.match.input.split(':')[1], 10) || 1;
    let rows = u.last_results || [];
    const PAGE = 5;
    const start = (page - 1) * PAGE;
    let end = Math.min(start + PAGE, rows.length);
    if (end - start < PAGE) {
      const filters = u.last_filters || {};
      const srcs = u.sources && u.sources.length ? u.sources : ['indeed','zip_recruiter'];
      try {
        const more = await jobspy.scrape_jobs({
          site_name: srcs,
          search_term: filters.keywords,
          location: filters.location,
          distance: filters.distance,
          is_remote: filters.remote,
          job_type: filters.job_type,
          hours_old: filters.hours_old,
          results_wanted: PAGE * 2,
          country_indeed: u.country_indeed || 'usa',
          offset: rows.length,
          request_timeout: 3000,
          scrape_timeout: 8000
        });
        if (more && more.length) {
          const seen = new Set(rows.map(r => r.job_url));
          for (const j of more) if (!seen.has(j.job_url)) { rows.push(j); seen.add(j.job_url); }
          await updateUser(uid, { last_results: rows });
          end = Math.min(start + PAGE, rows.length);
        }
      } catch {}
    }
    for (let i = start; i < end; i++) {
      const j = rows[i];
      const kb = new InlineKeyboard()
        .url('Открыть', j.job_url_raw || j.job_url).row()
        .text('В избранное', `fav:${i}`).row()
        .text('Похожие', `sim:${i}`).text('Поделиться', `share:${i}`).row()
        .text('Скрыть компанию', `mute:${i}`);
      await ctx.reply(buildCardText(langOf(u), j), { reply_markup: kb, disable_web_page_preview: !u.previews });
    }
    if (end < rows.length) {
      const kb = new InlineKeyboard().text('Ещё', `page:${page+1}`);
      await ctx.reply('Показать больше?', { reply_markup: kb });
    }
    await ctx.answerCallbackQuery();
  });

  // job actions: mute company, share, similar
  bot.callbackQuery(/^mute:(\d+)$/, async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const idx = parseInt(ctx.match[1], 10) || 0;
    const rows = u.last_results || [];
    const j = rows[idx];
    if (!j) { await ctx.answerCallbackQuery({ text: 'Нет' }); return; }
    const muted = new Set(u.muted_companies || []);
    if (j.company) muted.add(j.company);
    await updateUser(uid, { muted_companies: Array.from(muted), last_results: rows.filter(x => x.company !== j.company) });
    await ctx.answerCallbackQuery({ text: 'Компания скрыта' });
  });
  bot.callbackQuery(/^share:(\d+)$/, async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const idx = parseInt(ctx.match[1], 10) || 0;
    const rows = u.last_results || [];
    const j = rows[idx];
    if (!j) { await ctx.answerCallbackQuery({ text: 'Нет' }); return; }
    await ctx.api.sendMessage(uid, `${j.title} — ${j.company}\n${j.job_url}`);
    await ctx.answerCallbackQuery({ text: 'Отправлено' });
  });
  bot.callbackQuery(/^sim:(\d+)$/, async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const idx = parseInt(ctx.match[1], 10) || 0;
    const rows = u.last_results || [];
    const j = rows[idx];
    if (!j) { await ctx.answerCallbackQuery({ text: 'Нет' }); return; }
    const filters = { keywords: `${j.title} ${j.company}`.trim(), location: j.location };
    await ctx.answerCallbackQuery({ text: 'Ищу похожие…' });
    const matches = await runSearchForUser(uid, filters, { limit: 10 });
    for (const it of matches.slice(0,5)) {
      const kb = new InlineKeyboard().url('Открыть', it.job_url_raw || it.job_url);
      await ctx.api.sendMessage(uid, buildCardText(langOf(u), it), { reply_markup: kb, disable_web_page_preview: !u.previews });
    }
  });

  // base currency
  bot.command('currency', async (ctx) => {
    const uid = ctx.from.id;
    const val = (ctx.match || '').trim().toUpperCase();
    if (!val) { await ctx.reply('Укажите валюту, например: USD или EUR'); return; }
    await updateUser(uid, { base_currency: val });
    await ctx.reply(`Базовая валюта: ${val}`);
  });

  bot.callbackQuery(/^fav:/, async (ctx) => {
    const uid = ctx.from.id;
    const idx = parseInt(ctx.match.input.split(':')[1], 10) || 0;
    const u = await getUser(uid);
    const rows = u.last_results || [];
    const j = rows[idx];
    if (!j) { await ctx.answerCallbackQuery({ text: 'Нет данных' }); return; }
    const favs = u.favorites || [];
    const exists = favs.some(x => x.job_url === j.job_url);
    if (!exists) {
      favs.push(j);
      await updateUser(uid, { favorites: favs });
      await ctx.answerCallbackQuery({ text: texts.t(langOf(u), 'fav_added') });
    } else {
      await ctx.answerCallbackQuery({ text: texts.t(langOf(u), 'fav_exists') });
    }
  });

  // /favorites
  bot.command('favorites', async (ctx) => {
    const u = await getUser(ctx.from.id);
    const favs = u.favorites || [];
    if (!favs.length) { await ctx.reply('Пусто'); return; }
    for (const j of favs.slice(0, 10)) {
      await ctx.reply(`${j.title} — ${j.company} • ${j.location}\n${j.job_url}`, { disable_web_page_preview: true });
    }
  });

  bot.command('favorites_clear', async (ctx) => {
    const uid = ctx.from.id;
    await updateUser(uid, { favorites: [] });
    await ctx.reply('Избранное очищено');
  });

  // /export (CSV of last_results or favorites)
  bot.command('export', async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const arg = (ctx.match || '').trim().toLowerCase();
    const rows = arg === 'fav' || arg === 'favorites' ? (u.favorites || []) : (u.last_results || []);
    if (!rows.length) { await ctx.reply('Нет данных для экспорта'); return; }
    const buf = jobsToCsv(rows);
    const file = new InputFile(buf, 'jobs.csv');
    await bot.api.sendDocument(uid, file, { caption: texts.t(langOf(u), 'export_ready') });
  });

  // /summary (quick market summary of last results)
  bot.command('summary', async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const rows = u.last_results || [];
    if (!rows.length) { await ctx.reply('Нет данных'); return; }
    const n = rows.length;
    const bySite = new Map();
    const byLoc = new Map();
    const base = (u.base_currency || 'USD').toUpperCase();
    for (const r of rows) {
      bySite.set(r.site, (bySite.get(r.site) || 0) + 1);
      byLoc.set(r.location, (byLoc.get(r.location) || 0) + 1);
    }
    // salaries in base currency (yearly only)
    const rates = await ensureRates(u, storage, uid);
    const annual = [];
    for (const r of rows) {
      const interval = (r.interval || '').toLowerCase();
      const cur = (r.currency || '').toUpperCase();
      let val = null;
      const avg = v => (v && typeof v === 'number') ? v : null;
      const mi = avg(r.min_amount), ma = avg(r.max_amount);
      let a = null;
      if (mi && ma) a = (mi + ma) / 2; else a = mi || ma || null;
      if (!a) continue;
      if (interval === 'hourly') a = a * 40 * 52; // crude
      if (interval === 'weekly') a = a * 52;
      if (interval === 'monthly') a = a * 12;
      // convert currency
      if (cur && base && cur !== base) {
        const rfx = rates[base] && rates[cur] ? (rates[base] / rates[cur]) : (rates[cur] ? (1 / rates[cur]) : null);
        if (rfx) a = Math.round(a * rfx);
      }
      if (a) annual.push(a);
    }
    const pct = (arr, p) => {
      if (!arr.length) return null;
      const v = arr.slice().sort((a,b)=>a-b);
      const k = (v.length - 1) * p;
      const f = Math.floor(k), c = Math.ceil(k);
      if (f === c) return v[f];
      return Math.round(v[f] + (v[c] - v[f]) * (k - f));
    };
    const p25 = pct(annual, 0.25), p75 = pct(annual, 0.75);
    const topSites = Array.from(bySite.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}: ${v}`).join(', ');
    const topLocs = Array.from(byLoc.entries()).sort((a,b)=>b[1]-a[1]).slice(0,5).map(([k,v])=>`${k}: ${v}`).join(', ');
    const band = (p25 && p75) ? `${p25}–${p75} ${base}/yr` : '—';
    const body = `Всего вакансий: ${n}\nТоп источников: ${topSites || '—'}\nТоп локаций: ${topLocs || '—'}\nЗарплатный коридор (25–75%): ${band}`;
    await ctx.reply(body);
  });

  // /region_list (static list)
  bot.command('region_list', async (ctx) => {
    const list = 'usa, uk, india, germany, france, canada, australia, singapore, mexico, uae';
    await ctx.reply('Доступные страны для Indeed/Glassdoor:');
    await ctx.reply(list);
  });

  // /subs manage subscriptions for saved searches
  bot.command('subs', async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const list = u.saved_searches || [];
    if (!list.length) { await ctx.reply('Нет сохранённых поисков'); return; }
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const paused = (s.subs && s.subs.paused) ? true : false;
      const freq = (s.subs && s.subs.freq) || 'off';
      const kb = new InlineKeyboard()
        .text(paused ? 'Продолжить' : 'Пауза', `dg:toggle:${i}`)
        .row()
        .text('off', `dg:freq:${i}:off`).text('daily', `dg:freq:${i}:daily`).text('3d', `dg:freq:${i}:3d`).text('weekly', `dg:freq:${i}:weekly`)
        .row()
        .text('Отправить сейчас', `dg:digest:${i}`);
      await ctx.reply(`• ${s.name} (freq: ${freq}${paused ? ', paused' : ''})`, { reply_markup: kb });
    }
  });

  bot.callbackQuery(/^dg:(toggle|freq|digest):\d+(?::(off|daily|3d|weekly))?$/, async (ctx) => {
    const parts = ctx.match.input.split(':');
    const action = parts[1];
    const idx = parseInt(parts[2], 10) || 0;
    const val = parts[3];
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const list = u.saved_searches || [];
    if (idx < 0 || idx >= list.length) { await ctx.answerCallbackQuery(); return; }
    const s = list[idx];
    s.subs = s.subs || {};
    if (action === 'toggle') {
      s.subs.paused = !s.subs.paused;
    } else if (action === 'freq') {
      s.subs.freq = (val === 'off') ? 'off' : val;
    } else if (action === 'digest') {
      // send now minimal digest
      const rows = await runSearchForUser(uid, s.filters || {}, { limit: 10 });
      if (!rows.length) { await ctx.answerCallbackQuery({ text: 'Нет новых' }); return; }
      await ctx.api.sendMessage(uid, `Дайджест: ${s.name}`);
      for (const j of rows.slice(0,5)) {
        await ctx.api.sendMessage(uid, `${j.title} — ${j.company} • ${j.location}\n${j.job_url}`, { disable_web_page_preview: true });
      }
      s.subs.last_ts = Math.floor(Date.now()/1000);
    }
    list[idx] = s;
    await updateUser(uid, { saved_searches: list });
    await ctx.answerCallbackQuery({ text: 'OK' });
  });

  // Data export/delete
  bot.command('data_export', async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const raw = Buffer.from(JSON.stringify(u, null, 2), 'utf-8');
    const file = new InputFile(raw, `microstudio_user_${uid}.json`);
    await ctx.api.sendDocument(uid, file, { caption: 'Ваши данные (JSON)' });
  });
  bot.command('data_delete', async (ctx) => {
    const kb = new InlineKeyboard().text('Да', 'del:yes').text('Нет', 'del:no');
    await ctx.reply('Удалить все данные?', { reply_markup: kb });
  });
  bot.callbackQuery(/^del:(yes|no)$/, async (ctx) => {
    const uid = ctx.from.id;
    if (ctx.match[1] === 'yes') {
      await updateUser(uid, { ...await getUser(uid), favorites: [], saved_searches: [], last_results: [], muted_companies: [] });
      await ctx.editMessageText('Удалено');
    } else {
      await ctx.editMessageText('Отмена');
    }
    await ctx.answerCallbackQuery();
  });

  // About / Tour
  bot.command('about', async (ctx) => {
    await ctx.reply('MicroStudio Job Search — поиск вакансий по Indeed/ZipRecruiter и др. Используйте /q для быстрого поиска.');
  });
  bot.command('tour', async (ctx) => {
    const kb = new InlineKeyboard().text('Далее', 'tour:2');
    await ctx.reply('Шаг 1: Введите /q python loc:Berlin', { reply_markup: kb });
  });
  bot.callbackQuery(/^tour:(\d+)$/, async (ctx) => {
    const step = parseInt(ctx.match[1], 10) || 1;
    if (step === 2) {
      const kb = new InlineKeyboard().text('Далее', 'tour:3');
      await ctx.editMessageText('Шаг 2: Добавляйте в избранное и сохраняйте запросы', { reply_markup: kb });
    } else {
      await ctx.editMessageText('Готово!');
    }
    await ctx.answerCallbackQuery();
  });

  // Refine (filters)
  bot.command('refine', async (ctx) => {
    const kb = new InlineKeyboard()
      .text('24h', 'ref:h:24').text('72h', 'ref:h:72').text('168h', 'ref:h:168').row()
      .text('Удалёнка: да', 'ref:r:yes').text('нет', 'ref:r:no').text('любая', 'ref:r:any').row()
      .text('Тип: fulltime', 'ref:t:fulltime').text('contract', 'ref:t:contract').text('любая', 'ref:t:any').row()
      .text('Сортировка: дата', 'ref:s:date').text('зарплата', 'ref:s:salary').row()
      .text('Дистанция: 10', 'ref:dist:10').text('25', 'ref:dist:25').text('50', 'ref:dist:50').text('100', 'ref:dist:100').row()
      .text('Мин. зарплата 50k', 'ref:salmin:50000').text('100k', 'ref:salmin:100000').text('200k', 'ref:salmin:200000').row()
      .text('Валюта: USD', 'ref:cur:USD').text('EUR', 'ref:cur:EUR').text('GBP', 'ref:cur:GBP').row()
      .text('Источники: LI', 'ref:src:linkedin').text('IN', 'ref:src:indeed').text('GG', 'ref:src:google').text('ZR', 'ref:src:zip_recruiter').text('GD', 'ref:src:glassdoor').row()
      .text('BY', 'ref:src:bayt').text('NK', 'ref:src:naukri').text('BD', 'ref:src:bdjobs');
    await ctx.reply('Уточнить выдачу:', { reply_markup: kb });
  });
  bot.callbackQuery(/^ref:(h|r|t|s|salmin|cur|src|dist):(.+)$/, async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const filters = { ...(u.last_filters || {}) };
    const kind = ctx.match[1];
    const val = ctx.match[2];
    if (kind === 'h') filters.hours_old = parseInt(val, 10);
    else if (kind === 'r') filters.remote = (val === 'any' ? null : (val === 'yes'));
    else if (kind === 't') filters.job_type = (val === 'any' ? null : val);
    else if (kind === 's') {
      const rows = (u.last_results || []).slice();
      if (val === 'date') {
        rows.sort((a,b) => String(b.date_posted).localeCompare(String(a.date_posted)));
      } else if (val === 'salary') {
        const asAnnual = (r) => {
          const mi = r.min_amount, ma = r.max_amount;
          let a = (mi && ma) ? (mi+ma)/2 : (mi || ma || 0);
          const it = String(r.interval || '').toLowerCase();
          if (it === 'hourly') a *= 40*52;
          if (it === 'weekly') a *= 52;
          if (it === 'monthly') a *= 12;
          return a;
        };
        rows.sort((a,b) => (asAnnual(b) - asAnnual(a)));
      }
      await updateUser(uid, { last_results: rows });
      await ctx.answerCallbackQuery({ text: 'Сортировка обновлена' });
      return;
    } else if (kind === 'salmin') {
      const v = parseInt(val, 10) || 0;
      // Filter current rows by annual salary >= v (using currency filter if set)
      const cur = (u.view_currency || '').toUpperCase();
      const rows = (u.last_results || []).filter(r => {
        if (cur && (r.currency || '').toUpperCase() !== cur) return false;
        const mi = r.min_amount, ma = r.max_amount;
        const avg = (mi && ma) ? (mi+ma)/2 : (mi || ma || 0);
        const interval = (r.interval || '').toLowerCase();
        let a = avg;
        if (!a) return false;
        if (interval === 'hourly') a = a * 40 * 52;
        if (interval === 'weekly') a = a * 52;
        if (interval === 'monthly') a = a * 12;
        return a >= v;
      });
      await updateUser(uid, { last_results: rows, view_salary_min: v });
      await ctx.answerCallbackQuery({ text: `Мин. зарплата >= ${v}` });
      return;
    } else if (kind === 'cur') {
      const rows = (u.last_results || []).filter(r => !val || (r.currency || '').toUpperCase() === val.toUpperCase());
      await updateUser(uid, { last_results: rows, view_currency: val.toUpperCase() });
      await ctx.answerCallbackQuery({ text: `Валюта: ${val.toUpperCase()}` });
      return;
    } else if (kind === 'src') {
      const srcs = new Set(u.sources || []);
      if (srcs.has(val)) srcs.delete(val); else srcs.add(val);
      const arr = Array.from(srcs);
      await updateUser(uid, { sources: arr });
      await ctx.answerCallbackQuery({ text: `Источники обновлены` });
      return;
    } else if (kind === 'dist') {
      const n = parseInt(val, 10) || 0;
      filters.distance = n;
      const rows = await runSearchForUser(uid, filters, { limit: 15 });
      await ctx.answerCallbackQuery({ text: `Дистанция ${n}` });
      return;
    }
    const rows = await runSearchForUser(uid, filters, { limit: 15 });
    if (!rows.length) { await ctx.answerCallbackQuery({ text: '0 результатов' }); return; }
    await ctx.answerCallbackQuery({ text: 'Фильтр применён' });
  });

  // /suggest — подсказки ключевых слов из последней выдачи
  bot.command('suggest', async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const rows = u.last_results || [];
    if (!rows.length) { await ctx.reply('Нет данных'); return; }
    const STOP = new Set(['the','and','for','with','you','are','our','your','years','year','job','jobs','work','опыт','знание','знания','требования','обязанности','компания','работа']);
    const freq = new Map();
    const push = (w) => {
      const wl = w.toLowerCase();
      if (wl.length < 3 || STOP.has(wl) || /\d{2,}/.test(wl)) return;
      freq.set(wl, (freq.get(wl) || 0) + 1);
    };
    for (const r of rows) {
      const txt = `${r.title || ''} ${r.description || ''}`;
      const words = txt.match(/[A-Za-zА-Яа-я0-9+#.-]{2,}/g) || [];
      words.forEach(push);
    }
    const top = Array.from(freq.entries()).sort((a,b)=>b[1]-a[1]).slice(0,15).map(([k,v])=>`${k}(${v})`);
    await ctx.reply(top.length ? top.join(', ') : '—');
  });

  // /save <name>
  bot.command('save', async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const name = (ctx.match || '').trim() || new Date().toISOString().slice(0,16);
    const filters = u.last_filters || {};
    if (!filters || Object.keys(filters).length === 0) { await ctx.reply('Нет активного поиска'); return; }
    const others = (u.saved_searches || []).filter(s => s.name !== name);
    const existing = (u.saved_searches || []).find(s => s.name === name);
    const subs = (existing && existing.subs) || {};
    const saved_searches = [...others, { name, filters, subs }];
    await updateUser(uid, { saved_searches });
    await ctx.reply(`Сохранено: ${name}`);
  });

  // /saved
  bot.command('saved', async (ctx) => {
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const list = u.saved_searches || [];
    if (!list.length) { await ctx.reply('Нет сохранённых поисков'); return; }
    for (let i = 0; i < list.length; i++) {
      const s = list[i];
      const kb = new InlineKeyboard().text('Запустить', `saved:run:${i}`).text('Удалить', `saved:del:${i}`);
      await ctx.reply(`• ${s.name}`, { reply_markup: kb });
    }
  });

  bot.callbackQuery(/^saved:(run|del):\d+$/, async (ctx) => {
    const [_, action, idxStr] = ctx.match.input.split(':');
    const idx = parseInt(idxStr, 10) || 0;
    const uid = ctx.from.id;
    const u = await getUser(uid);
    const list = u.saved_searches || [];
    if (idx < 0 || idx >= list.length) { await ctx.answerCallbackQuery({ text: 'Нет' }); return; }
    if (action === 'del') {
      const kept = list.filter((_, i) => i !== idx);
      await updateUser(uid, { saved_searches: kept });
      await ctx.answerCallbackQuery({ text: 'Удалено' });
      return;
    }
    const entry = list[idx];
    const srcs = u.sources && u.sources.length ? u.sources : ['indeed','zip_recruiter'];
    const rows = await jobspy.scrape_jobs({
      site_name: srcs,
      search_term: (entry.filters || {}).keywords,
      location: (entry.filters || {}).location,
      results_wanted: 15,
      country_indeed: u.country_indeed || 'usa',
      request_timeout: 3000,
      scrape_timeout: 8000
    });
    await storage.updateUser(uid, { last_results: rows });
    if (!rows.length) { await ctx.reply('Результатов нет'); await ctx.answerCallbackQuery(); return; }
    for (const j of rows.slice(0,5)) {
      const kb = new InlineKeyboard()
        .url('Открыть', j.job_url_raw || j.job_url).row()
        .text('В избранное', `fav:0`).row()
        .text('Похожие', `sim:0`).text('Поделиться', `share:0`).row()
        .text('Скрыть компанию', `mute:0`);
      await ctx.reply(buildCardText(langOf(u), j), { reply_markup: kb, disable_web_page_preview: !u.previews });
    }
    await ctx.answerCallbackQuery({ text: 'Готово' });
  });

  return bot;
}

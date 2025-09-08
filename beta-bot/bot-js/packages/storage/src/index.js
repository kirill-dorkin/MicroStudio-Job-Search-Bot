import fs from 'node:fs';
import path from 'node:path';

let kvClient = null;
try {
  // Lazy import to avoid failing locally without KV
  const kv = await import('@vercel/kv');
  kvClient = kv.default ?? kv;
} catch (_) {
  kvClient = null;
}

const DEFAULT_USER = {
  lang: 'ru',
  role: 'jobseeker',
  sources: ['indeed', 'linkedin', 'google', 'zip_recruiter', 'glassdoor'],
  country_indeed: 'usa',
  previews: false,
  base_currency: 'USD',
  fx_rates: {},
  fx_ts: 0,
  muted_companies: [],
  notifications: true,
  favorites: [],
  saved_searches: [],
  subs: { freq: 'daily' },
  last_results: []
};

// ---- KV Storage ----
class KVStorage {
  constructor() {
    this.kv = kvClient?.kv ?? kvClient; // support both ESM default and named
  }
  async _key(uid) { return `user:${uid}`; }
  async _indexKey() { return 'users:index'; }
  async getUser(uid) {
    const key = await this._key(uid);
    const data = await this.kv.get(key);
    if (data) return data;
    const d = { ...DEFAULT_USER };
    await this.setUser(uid, d);
    return d;
  }
  async setUser(uid, user) {
    const key = await this._key(uid);
    await this.kv.set(key, user);
    await this.kv.sadd(await this._indexKey(), String(uid));
  }
  async updateUser(uid, patch) {
    const user = await this.getUser(uid);
    const merged = { ...user, ...patch };
    await this.setUser(uid, merged);
  }
  async listUsers() {
    const ids = await this.kv.smembers(await this._indexKey());
    return (ids || []).map(x => parseInt(x, 10)).filter(n => !Number.isNaN(n));
  }
}

// ---- File Storage (for local dev) ----
class FileStorage {
  constructor(options = {}) {
    const root = options.root || process.cwd();
    this.dbPath = options.dbPath || path.join(root, 'apps', 'web', 'data', 'db.json');
    this._ensure();
  }
  _ensure() {
    const dir = path.dirname(this.dbPath);
    fs.mkdirSync(dir, { recursive: true });
    if (!fs.existsSync(this.dbPath)) {
      fs.writeFileSync(this.dbPath, JSON.stringify({}, null, 2), 'utf-8');
    }
  }
  _load() {
    try {
      const raw = fs.readFileSync(this.dbPath, 'utf-8');
      return JSON.parse(raw || '{}');
    } catch {
      return {};
    }
  }
  _save(db) {
    this._ensure();
    fs.writeFileSync(this.dbPath, JSON.stringify(db, null, 2), 'utf-8');
  }
  async getUser(uid) {
    const db = this._load();
    const key = String(uid);
    if (!db[key]) {
      db[key] = { ...DEFAULT_USER };
      this._save(db);
    }
    return db[key];
  }
  async setUser(uid, user) {
    const db = this._load();
    db[String(uid)] = user;
    this._save(db);
  }
  async updateUser(uid, patch) {
    const user = await this.getUser(uid);
    await this.setUser(uid, { ...user, ...patch });
  }
  async listUsers() {
    const db = this._load();
    return Object.keys(db).map(k => parseInt(k, 10)).filter(n => !Number.isNaN(n));
  }
}

export function createStorage() {
  const hasKV = !!(kvClient && (kvClient.kv || kvClient.get));
  if (hasKV && process.env.KV_URL) {
    return new KVStorage();
  }
  return new FileStorage({ root: path.resolve(process.cwd(), '../../') });
}

// Convenience helpers mirroring Python storage API
export async function getUser(uid, storage) { return storage.getUser(uid); }
export async function setUser(uid, data, storage) { return storage.setUser(uid, data); }
export async function updateUser(uid, patch, storage) { return storage.updateUser(uid, patch); }
export async function listUsers(storage) { return storage.listUsers(); }

export async function saveFavorite(uid, job, storage) {
  const u = await storage.getUser(uid);
  const exists = (u.favorites || []).some(j => j.job_url === job.job_url);
  if (!exists) {
    u.favorites = [...(u.favorites || []), job];
    await storage.setUser(uid, u);
    return true;
  }
  return false;
}
export async function listFavorites(uid, storage) {
  const u = await storage.getUser(uid);
  return u.favorites || [];
}
export async function clearFavorites(uid, storage) {
  const u = await storage.getUser(uid);
  u.favorites = [];
  await storage.setUser(uid, u);
}
export async function saveLastResults(uid, jobs, storage) {
  const u = await storage.getUser(uid);
  u.last_results = jobs;
  await storage.setUser(uid, u);
}
export async function getLastResults(uid, storage) {
  const u = await storage.getUser(uid);
  return u.last_results || [];
}
export async function saveSearch(uid, name, filters, storage) {
  const u = await storage.getUser(uid);
  const others = (u.saved_searches || []).filter(s => s.name !== name);
  const existing = (u.saved_searches || []).find(s => s.name === name);
  const subs = (existing && existing.subs) || {};
  u.saved_searches = [...others, { name, filters, subs }];
  await storage.setUser(uid, u);
}
export async function listSavedSearches(uid, storage) {
  const u = await storage.getUser(uid);
  return u.saved_searches || [];
}


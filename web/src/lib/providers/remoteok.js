import axios from '../services/axios';
import { slugify } from '../utils/helper';

export const PROVIDER_ID = 'remoteok';
export const PROVIDER_NAME = 'RemoteOK';

const API_URL = 'https://remoteok.com/api';
const CACHE_TTL_MS = 5 * 60 * 1000;
const REQUEST_HEADERS = {
  'User-Agent': 'MicroStudioJobBot/1.0 (+https://github.com/MicroStudio-Job-Search-Bot)',
  Accept: 'application/json',
};

let jobsCache = null;

const isFresh = (entry) => entry && Date.now() - entry.timestamp < CACHE_TTL_MS;

const toCacheEntry = (value) => ({ value, timestamp: Date.now() });

const normalizeJobType = (tags = []) => {
  const normalized = tags
    .filter(Boolean)
    .map((tag) => tag.toString().toLowerCase());
  if (normalized.some((tag) => tag.includes('full'))) return 'full_time';
  if (normalized.some((tag) => tag.includes('part'))) return 'part_time';
  if (normalized.some((tag) => tag.includes('contract'))) return 'contract';
  return normalized[0] || '';
};

const buildSalaryLabel = (job) => {
  if (job.salary) return job.salary;
  if (job.salary_min && job.salary_max) {
    return `${job.salary_min} - ${job.salary_max}`;
  }
  return job.salary_min || job.salary_max || job.compensation || '';
};

const normalizeJob = (job) => {
  if (!job || !job.id) return null;
  const sourceId = job.id;
  const tags = Array.isArray(job.tags) ? job.tags : [];
  const primaryCategory = tags[0] || job.position || 'Remote';
  const categorySlugs = Array.from(
    new Set([
      ...tags.map((tag) => slugify(tag)),
      slugify(primaryCategory),
    ]).values()
  ).filter(Boolean);

  return {
    id: `${PROVIDER_ID}::${sourceId}`,
    providerId: PROVIDER_ID,
    sourceId: String(sourceId),
    title: job.position ?? '',
    company_name: job.company ?? '',
    company_logo: job.logo || job.company_logo || '',
    category: primaryCategory,
    categorySlugs,
    job_type: normalizeJobType(tags),
    publication_date: job.date ?? null,
    candidate_required_location: job.location || 'Worldwide',
    salary: buildSalaryLabel(job),
    description: job.description ?? '',
    url: job.url || job.apply_url || job.original || '',
  };
};

const loadJobs = async () => {
  if (isFresh(jobsCache)) return jobsCache.value;
  try {
    const response = await axios.get(API_URL, { headers: REQUEST_HEADERS });
    const entries = Array.isArray(response.data) ? response.data : [];
    const jobs = entries
      .filter((entry) => entry && entry.id)
      .map(normalizeJob)
      .filter(Boolean);
    jobsCache = toCacheEntry(jobs);
    return jobs;
  } catch (error) {
    console.error('Failed to fetch RemoteOK jobs', error);
    jobsCache = toCacheEntry([]);
    return [];
  }
};

const matchesQuery = (job, query) => {
  if (!query) return true;
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  const haystacks = [
    job.title,
    job.company_name,
    job.description,
    job.category,
    ...(Array.isArray(job.categorySlugs) ? job.categorySlugs : []),
  ];
  return haystacks.some((value) =>
    typeof value === 'string' && value.toLowerCase().includes(normalized)
  );
};

const matchesCategory = (job, category) => {
  if (!category || category === 'all') return true;
  const slugs = Array.isArray(job.categorySlugs) ? job.categorySlugs : [];
  return slugs.includes(category);
};

export const fetchJobs = async ({ query = '', category = '' } = {}) => {
  const jobs = await loadJobs();
  return jobs.filter(
    (job) => matchesQuery(job, query) && matchesCategory(job, category)
  );
};

export const fetchJobById = async (id) => {
  if (!id) return null;
  const jobs = await loadJobs();
  return (
    jobs.find((job) => job.sourceId === id || job.id === `${PROVIDER_ID}::${id}`) ||
    null
  );
};

export const fetchCategories = async () => {
  const jobs = await loadJobs();
  const all = jobs.flatMap((job) => job.categorySlugs || []);
  return Array.from(new Set(all.filter(Boolean)));
};

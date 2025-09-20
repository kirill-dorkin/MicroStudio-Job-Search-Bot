import axios from '../services/axios';
import { slugify } from '../utils/helper';

export const PROVIDER_ID = 'arbeitnow';
export const PROVIDER_NAME = 'Arbeitnow';

const API_URL = 'https://www.arbeitnow.com/api/job-board-api';
const CACHE_TTL_MS = 5 * 60 * 1000;
const MAX_PAGES = 3;

let jobsCache = null;

const isFresh = (entry) => entry && Date.now() - entry.timestamp < CACHE_TTL_MS;

const toCacheEntry = (value) => ({ value, timestamp: Date.now() });

const normalizeJobType = (types) => {
  if (!Array.isArray(types) || types.length === 0) return '';
  const normalized = types.map((type) => type.toString().toLowerCase());
  if (normalized.some((type) => type.includes('full'))) return 'full_time';
  if (normalized.some((type) => type.includes('part'))) return 'part_time';
  if (normalized.some((type) => type.includes('contract'))) return 'contract';
  return normalized[0];
};

const buildSalaryRange = (job) => {
  if (!job) return '';
  if (job.salary) return job.salary;
  if (job.salary_min && job.salary_max) return `${job.salary_min} - ${job.salary_max}`;
  return job.salary_min || job.salary_max || '';
};

const normalizeJob = (job) => {
  if (!job) return null;
  const sourceId = job.slug || job.id || slugify(`${job.company_name}-${job.title}`);
  if (!sourceId) return null;
  const tags = Array.isArray(job.tags) ? job.tags : [];
  const jobTypes = Array.isArray(job.job_types) ? job.job_types : [];
  const rawCategories = [...tags, ...jobTypes].filter(Boolean);
  const primaryCategory = tags[0] || jobTypes[0] || 'Remote';
  const categorySlugs = Array.from(
    new Set([
      ...rawCategories.map((item) => slugify(item)),
      slugify(primaryCategory),
    ]).values()
  ).filter(Boolean);

  return {
    id: `${PROVIDER_ID}::${sourceId}`,
    providerId: PROVIDER_ID,
    sourceId: String(sourceId),
    title: job.title ?? '',
    company_name: job.company_name ?? '',
    company_logo: '',
    category: primaryCategory,
    categorySlugs,
    job_type: normalizeJobType(jobTypes),
    publication_date: job.created_at ?? null,
    candidate_required_location:
      job.location || (job.remote ? 'Remote' : 'On-site'),
    salary: buildSalaryRange(job),
    description: job.description ?? '',
    url: job.url ?? '',
  };
};

const fetchPage = async (url) => {
  const response = await axios.get(url);
  const data = response.data ?? response;
  if (Array.isArray(data)) {
    return { jobs: data, next: null };
  }
  return {
    jobs: Array.isArray(data?.data) ? data.data : [],
    next: data?.links?.next ?? null,
  };
};

const loadJobs = async () => {
  if (isFresh(jobsCache)) return jobsCache.value;

  let nextUrl = API_URL;
  let page = 0;
  const collected = [];

  while (nextUrl && page < MAX_PAGES) {
    try {
      const { jobs, next } = await fetchPage(nextUrl);
      collected.push(...jobs.map(normalizeJob).filter(Boolean));
      nextUrl = next;
      page += 1;
    } catch (error) {
      console.error('Failed to fetch Arbeitnow jobs', error);
      break;
    }
  }

  jobsCache = toCacheEntry(collected);
  return collected;
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

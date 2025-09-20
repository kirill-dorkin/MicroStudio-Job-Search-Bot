import axios from '../services/axios';
import { slugify } from '../utils/helper';

export const PROVIDER_ID = 'remotive';
export const PROVIDER_NAME = 'Remotive';

const normalizeJobType = (value) => {
  if (!value) return '';
  const lower = value.toString().toLowerCase();
  if (lower === 'fulltime') return 'full_time';
  return lower;
};

const normalizeJob = (job) => {
  if (!job) return null;
  const sourceId = job.id ?? job.job_id ?? job.slug;
  if (!sourceId) return null;
  const category = job.category || job.job_category || '';
  const categorySlug = slugify(category);

  return {
    id: `${PROVIDER_ID}::${sourceId}`,
    providerId: PROVIDER_ID,
    sourceId: String(sourceId),
    title: job.title ?? '',
    company_name: job.company_name ?? '',
    company_logo: job.company_logo ?? '',
    category: category || 'Remote',
    categorySlugs: categorySlug ? [categorySlug] : [],
    job_type: normalizeJobType(job.job_type),
    publication_date: job.publication_date ?? job.created_at ?? null,
    candidate_required_location: job.candidate_required_location || 'Worldwide',
    salary: job.salary ?? '',
    description: job.description ?? '',
    url: job.url ?? job.job_url ?? job.job_link ?? '',
  };
};

export const fetchJobs = async ({ query = '', category = '' } = {}) => {
  const params = {};
  if (query) params.search = query;
  if (category && category !== 'all') params.category = category;
  const response = await axios.get('/', { params });
  const jobs = Array.isArray(response.data?.jobs) ? response.data.jobs : [];
  return jobs.map(normalizeJob).filter(Boolean);
};

export const fetchJobById = async (id) => {
  if (!id) return null;
  const response = await axios.get('/', { params: { job_id: id } });
  const data = response.data ?? response;
  const job = data?.job || (Array.isArray(data?.jobs) ? data.jobs[0] : null);
  return normalizeJob(job);
};

export const fetchCategories = async () => {
  const response = await axios.get('/categories');
  const categories = response.data?.jobs;
  if (!Array.isArray(categories)) return [];
  const slugs = categories
    .map((category) => category?.slug || slugify(category?.name))
    .filter(Boolean);
  return Array.from(new Set(slugs));
};

import providers, { providerMap } from '../providers';
import { JOBS_PER_PAGE, MAX_LOCATIONS } from '../utils/constant';
import { slugify } from '../utils/helper';

const CACHE_TTL_MS = 5 * 60 * 1000;
const jobListCache = new Map();
const jobDetailCache = new Map();

const isFresh = (entry) => entry && Date.now() - entry.timestamp < CACHE_TTL_MS;
const toCacheEntry = (value) => ({ value, timestamp: Date.now() });

const normalizeJobs = (jobs) => (Array.isArray(jobs) ? jobs : []);

const handleRequest = async (fn, fallbackMessage) => {
  try {
    return await fn();
  } catch (error) {
    const message =
      error?.message ||
      error?.response?.data?.message ||
      fallbackMessage ||
      'Request failed.';
    const wrapped = new Error(message);
    wrapped.cause = error;
    throw wrapped;
  }
};

const fetchJobsRaw = async (cacheKey, fetcher) => {
  const cached = jobListCache.get(cacheKey);
  if (isFresh(cached)) {
    return cached.value;
  }
  const data = await fetcher();
  const jobs = normalizeJobs(data?.jobs);
  jobListCache.set(cacheKey, toCacheEntry(jobs));
  return jobs;
};

const isFullTimeType = (value) => {
  if (!value) return false;
  const normalized = value.toString().toLowerCase().replace(/[-\s]/g, '_');
  return normalized === 'full_time';
};

const getDateValue = (value) => {
  if (!value) return 0;
  const time = new Date(value).getTime();
  return Number.isFinite(time) ? time : 0;
};

const sortByDateDesc = (jobs = []) =>
  [...jobs].sort(
    (a, b) => getDateValue(b?.publication_date) - getDateValue(a?.publication_date)
  );

const aggregateJobs = async ({ query = '', category = '' } = {}) => {
  const responses = await Promise.all(
    providers.map(async (provider) => {
      if (typeof provider.fetchJobs !== 'function') return [];
      try {
        const jobs = await provider.fetchJobs({ query, category });
        return Array.isArray(jobs) ? jobs : [];
      } catch (error) {
        const label = provider.PROVIDER_NAME || provider.PROVIDER_ID || 'unknown';
        console.error(`Failed to load jobs from ${label}`, error);
        return [];
      }
    })
  );

  const seen = new Set();
  const combined = [];

  responses
    .flat()
    .forEach((job) => {
      if (!job || !job.id) return;
      if (seen.has(job.id)) return;
      seen.add(job.id);
      combined.push(job);
    });

  const categorySlug = category && category !== 'all' ? category : '';

  const filtered = categorySlug
    ? combined.filter((job) => {
        const slugs = Array.isArray(job.categorySlugs) ? job.categorySlugs : [];
        if (slugs.includes(categorySlug)) return true;
        if (!slugs.length && job.category) {
          return slugify(job.category) === categorySlug;
        }
        return false;
      })
    : combined;

  return sortByDateDesc(filtered);
};

const filter = ({
  jobs,
  fullTime = false,
  location = 'all',
  otherLocations = [],
}) => {
  const fullTimeFlag = Boolean(fullTime);
  const normalizedLocation = location || 'all';

  return jobs.filter((job) => {
    const jobType = job?.job_type;
    const jobLocation = (job?.candidate_required_location || '').trim();

    if (fullTimeFlag && !isFullTimeType(jobType)) {
      return false;
    }

    if (normalizedLocation === 'all') return true;
    if (normalizedLocation === 'others') {
      return otherLocations.includes(jobLocation);
    }

    return jobLocation === normalizedLocation;
  });
};

export const getLocations = (jobs = []) => {
  const locations = [];
  const count = {};

  normalizeJobs(jobs).forEach((job) => {
    const location = (job?.candidate_required_location || '').trim();
    if (!location) return;
    count[location] = count[location] ? count[location] + 1 : 1;
    locations.push(location);
  });

  const uniqueLocations = [...new Set(locations)];
  const sortedUniqueLocations = uniqueLocations.sort((a, b) => count[b] - count[a]);

  return {
    all: sortedUniqueLocations.slice(0, MAX_LOCATIONS),
    others: sortedUniqueLocations.slice(MAX_LOCATIONS),
  };
};

const fetchAllJobs = (query = '') =>
  handleRequest(
    async () => {
      const jobs = await aggregateJobs({ query });
      return { jobs };
    },
    'Unable to load jobs. Please try again later.'
  );

const fetchJobsForCategory = (category = '', query = '') =>
  handleRequest(
    async () => {
      const jobs = await aggregateJobs({ category, query });
      return { jobs };
    },
    'Unable to load jobs for this category.'
  );

export const getAllJobs = async (query = '', fullTime = false, location = 'all') => {
  const cacheKey = `all::${query || ''}`;
  const rawJobs = await fetchJobsRaw(cacheKey, () => fetchAllJobs(query));
  const locations = getLocations(rawJobs);

  return {
    jobs: filter({
      jobs: rawJobs,
      fullTime,
      otherLocations: locations.others,
      location,
    }),
    locations,
  };
};

export const getJobsByCategory = async (
  category = '',
  query = '',
  fullTime = false,
  location = 'all'
) => {
  const cacheKey = `category::${category || 'all'}::${query || ''}`;
  const rawJobs = await fetchJobsRaw(cacheKey, () => fetchJobsForCategory(category, query));
  const locations = getLocations(rawJobs);

  return {
    jobs: filter({
      jobs: rawJobs,
      fullTime,
      otherLocations: locations.others,
      location,
    }),
    locations,
  };
};

const collectCategoriesFromJobs = (jobs = []) => {
  const counts = new Map();

  normalizeJobs(jobs).forEach((job) => {
    const slugs = Array.isArray(job.categorySlugs) ? job.categorySlugs.slice() : [];
    if ((!slugs || slugs.length === 0) && job.category) {
      const fallback = slugify(job.category);
      if (fallback) slugs.push(fallback);
    }
    slugs.forEach((slug) => {
      if (!slug) return;
      counts.set(slug, (counts.get(slug) || 0) + 1);
    });
  });

  return Array.from(counts.entries())
    .sort((a, b) => b[1] - a[1])
    .map(([slug]) => slug);
};

export const getJobsCategories = async () => {
  const cachedAll = jobListCache.get('all::');
  if (isFresh(cachedAll) && cachedAll.value?.length) {
    return collectCategoriesFromJobs(cachedAll.value);
  }

  const responses = await Promise.all(
    providers.map(async (provider) => {
      if (typeof provider.fetchCategories !== 'function') return [];
      try {
        const categories = await provider.fetchCategories();
        return Array.isArray(categories) ? categories : [];
      } catch (error) {
        const label = provider.PROVIDER_NAME || provider.PROVIDER_ID || 'unknown';
        console.error(`Failed to load categories from ${label}`, error);
        return [];
      }
    })
  );

  const counts = new Map();
  responses
    .flat()
    .forEach((slug) => {
      if (!slug) return;
      counts.set(slug, (counts.get(slug) || 0) + 1);
    });

  if (counts.size > 0) {
    return Array.from(counts.entries())
      .sort((a, b) => b[1] - a[1])
      .map(([slug]) => slug);
  }

  const fallbackJobs = await aggregateJobs({});
  if (fallbackJobs.length) {
    jobListCache.set('all::', toCacheEntry(fallbackJobs));
    return collectCategoriesFromJobs(fallbackJobs);
  }

  return [];
};

const findJobInCachedLists = (id) => {
  for (const entry of jobListCache.values()) {
    if (!isFresh(entry)) continue;
    const match = entry.value.find((job) => job?.id?.toString() === id.toString());
    if (match) {
      return match;
    }
  }
  return null;
};

const parseCompositeId = (value) => {
  if (value === null || value === undefined) {
    return { providerId: null, providerJobId: null };
  }
  const stringValue = value.toString();
  const parts = stringValue.split('::');
  if (parts.length < 2) {
    return { providerId: null, providerJobId: stringValue };
  }
  const [providerId, ...rest] = parts;
  return { providerId, providerJobId: rest.join('::') };
};

export const getJobById = async (id) => {
  if (!id) return null;
  const stringId = id.toString();
  const cached = jobDetailCache.get(stringId);
  if (isFresh(cached)) {
    return cached.value;
  }

  const fromLists = findJobInCachedLists(stringId);
  if (fromLists) {
    jobDetailCache.set(stringId, toCacheEntry(fromLists));
    return fromLists;
  }

  const { providerId, providerJobId } = parseCompositeId(stringId);
  if (!providerId || !providerJobId) {
    const err = new Error('Job not found.');
    throw err;
  }

  const provider = providerMap[providerId];
  if (!provider || typeof provider.fetchJobById !== 'function') {
    const err = new Error('Job not found.');
    throw err;
  }

  const job = await handleRequest(
    () => provider.fetchJobById(providerJobId),
    'Unable to load job details.'
  );

  if (!job) {
    const err = new Error('Job not found.');
    throw err;
  }

  jobDetailCache.set(stringId, toCacheEntry(job));
  return job;
};

export const getJobsPerPage = (page, jobs = []) => {
  const start = (page - 1) * JOBS_PER_PAGE;
  const end = page * JOBS_PER_PAGE;
  return normalizeJobs(jobs).slice(start, end);
};

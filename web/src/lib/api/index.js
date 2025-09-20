
import axios from '../services/axios';
import requests from '../services/requests';
import { JOBS_PER_PAGE, MAX_LOCATIONS } from '../utils/constant';

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

const filter = ({
  jobs,
  fullTime = false,
  location = 'all',
  otherLocations = [],
}) => {
  const fullTimeFlag = Boolean(fullTime);
  return jobs.filter((job) => {
    const jobType = job?.job_type;
    const jobLocation = job?.candidate_required_location || '';
    return (
      (!fullTimeFlag || jobType === 'full_time' || jobType === 'fulltime') &&
      (location === 'all' ||
        (location === 'others'
          ? otherLocations.includes(jobLocation)
          : jobLocation === location))
    );
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
    () => axios.get(requests.all(query)),
    'Unable to load jobs. Please try again later.'
  ).then((res) => res.data ?? res);

const fetchJobsForCategory = (category = '', query = '') =>
  handleRequest(
    () => axios.get(requests.categories(category, query)),
    'Unable to load jobs for this category.'
  ).then((res) => res.data ?? res);

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

export const getJobsCategories = async () => {
  const response = await handleRequest(
    () => axios.get(requests.categories()),
    'Unable to load job categories.'
  );
  const categories = response.data?.jobs;
  if (!Array.isArray(categories)) return [];
  return categories
    .map((category) => category?.slug)
    .filter((slug) => typeof slug === 'string' && slug.length > 0);
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

export const getJobById = async (id) => {
  if (!id) return null;
  const cached = jobDetailCache.get(id);
  if (isFresh(cached)) {
    return cached.value;
  }

  const fromLists = findJobInCachedLists(id);
  if (fromLists) {
    jobDetailCache.set(id, toCacheEntry(fromLists));
    return fromLists;
  }

  const { url, params } = requests.job(id);
  const response = await handleRequest(
    () => axios.get(url, { params }),
    'Unable to load job details.'
  );
  const data = response.data ?? response;
  const job = data?.job || (Array.isArray(data?.jobs) ? data.jobs[0] : null);
  if (!job) {
    const err = new Error('Job not found.');
    throw err;
  }
  jobDetailCache.set(id, toCacheEntry(job));
  return job;
};

export const getJobsPerPage = (page, jobs = []) => {
  const start = (page - 1) * JOBS_PER_PAGE;
  const end = page * JOBS_PER_PAGE;
  return normalizeJobs(jobs).slice(start, end);
};

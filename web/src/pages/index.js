
import styles from '../styles/containers/Main.module.scss';

import { getAllJobs, getJobsCategories, getJobsPerPage } from '../lib/api';
import { getSeoData } from '../lib/utils/portfolio';

import SEO from '../components/SEO';
import Hero from '../containers/Hero';
import Filter from '../containers/Filter';
import Jobs from '../containers/Jobs';
import { getTotalPages } from '../lib/utils/helper';

const EMPTY_LOCATIONS = { all: [], others: [] };

export const getServerSideProps = async (ctx) => {
  const query = ctx.query?.search ?? '';
  const page = Number(ctx.query?.page ?? 1);
  const location = ctx.query?.location ?? 'all';
  const fullTime = Boolean(Number(ctx.query?.fullTime ?? 0));

  let jobs = [];
  let locations = EMPTY_LOCATIONS;
  let categories = [];
  let totalPages = 0;
  let error = null;

  try {
    const allJobs = await getAllJobs(query, fullTime, location);
    jobs = allJobs.jobs;
    locations = allJobs.locations;
    categories = await getJobsCategories();
    totalPages = getTotalPages(jobs.length);
    jobs = getJobsPerPage(page, jobs);
  } catch (err) {
    error = err?.message || 'Unable to load jobs right now.';
    console.error('Failed to load home page data', err);
  }

  return {
    props: {
      jobs,
      currentPage: page,
      categories,
      totalPages,
      locations,
      location,
      search: query,
      fullTime: Number(fullTime),
      error,
    },
  };
};

export default function Home({
  jobs,
  categories,
  totalPages,
  currentPage,
  locations,
  location,
  fullTime,
  search,
  error,
}) {
  return (
    <>
      <SEO {...getSeoData()} />
      <Hero categories={categories} search={search} />
      <main className={styles['main']}>
        <Filter
          className={styles['main__aside']}
          fullTime={Boolean(fullTime)}
          selectedLocation={location}
          locations={locations}
        />
        <Jobs
          className={styles['main__jobs']}
          {...{ jobs, totalPages, currentPage }}
          error={error}
        />
      </main>
    </>
  );
}

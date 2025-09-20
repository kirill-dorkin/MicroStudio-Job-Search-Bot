
import styles from '../../styles/containers/Main.module.scss';

import {
  getJobsCategories,
  getJobsByCategory,
  getJobsPerPage,
} from '../../lib/api';
import SEO from '../../components/SEO';
import { getSeoData } from '../../lib/utils/portfolio';
import Hero from '../../containers/Hero';
import Filter from '../../containers/Filter';
import Jobs from '../../containers/Jobs';
import { getTotalPages } from '../../lib/utils/helper';

const EMPTY_LOCATIONS = { all: [], others: [] };

export const getServerSideProps = async (ctx) => {
  const { category } = ctx.params;
  const query = ctx.query?.search ?? '';
  const page = Number(ctx.query?.page ?? 1);
  const location = ctx.query?.location ?? 'all';
  const fullTime = Boolean(Number(ctx.query?.fullTime ?? 0));

  let jobs = [];
  let locations = EMPTY_LOCATIONS;
  let categories = [];
  let totalPages = 0;
  let totalResults = 0;
  let error = null;

  try {
    const result = await getJobsByCategory(category, query, fullTime, location);
    jobs = result.jobs;
    locations = result.locations;
    categories = await getJobsCategories();
    totalResults = jobs.length;
    totalPages = getTotalPages(totalResults);
    jobs = getJobsPerPage(page, jobs);
  } catch (err) {
    error = 'We could not reach the Remotive API right now. Please try again soon.';
    console.error('Failed to load category page data', err);
  }

  return {
    props: {
      jobs,
      fullTime: Number(fullTime),
      currentPage: page,
      search: query,
      totalPages,
      locations,
      location,
      categories,
      category,
      totalResults,
      error,
    },
  };
};

export default function CategoryPage({
  jobs,
  categories,
  category,
  totalPages,
  currentPage,
  fullTime,
  locations,
  location,
  search,
  totalResults,
  error,
}) {
  return (
    <>
      <SEO {...getSeoData()} />
      <Hero
        categories={categories}
        selectedCategory={category}
        search={search}
        totalResults={totalResults}
      />
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
          totalResults={totalResults}
          searchTerm={search}
          selectedCategory={category}
          error={error}
        />
      </main>
    </>
  );
}

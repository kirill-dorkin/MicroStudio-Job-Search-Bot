import JobItem from '../components/JobItem';
import Pagination from '../components/Pagination';
import Error from '../components/UI/Error';
import { formatCategoryName, formatNumber, timeFormatter } from '../lib/utils/helper';

import styles from '../styles/containers/Jobs.module.scss';

const Jobs = ({
  jobs = [],
  totalPages = 0,
  currentPage = 1,
  className = '',
  error,
  totalResults = 0,
  searchTerm = '',
  selectedCategory = 'all',
}) => {
  if (error) {
    return <Error message={error} type='api' />;
  }

  if (!jobs.length) {
    return (
      <Error message='No roles match your filters yet. Try adjusting your keywords or location.' />
    );
  }

  const classes = [styles['jobs'], className].filter(Boolean).join(' ');

  const humanCategory =
    selectedCategory && selectedCategory !== 'all'
      ? formatCategoryName(selectedCategory)
      : 'remote';

  const formattedTotal = formatNumber(totalResults);
  const formattedCurrent = formatNumber(jobs.length);

  const summarySegments = [];
  if (searchTerm) {
    summarySegments.push(`matching “${searchTerm}”`);
  }
  if (selectedCategory && selectedCategory !== 'all') {
    summarySegments.push(`in ${humanCategory.toLowerCase()}`);
  }

  const summaryText = [`Showing ${formattedCurrent} of ${formattedTotal} roles`]
    .concat(summarySegments)
    .join(' • ');

  return (
    <section className={classes} aria-live='polite'>
      <header className={styles['jobs__header']}>
        <div>
          <p className={styles['jobs__eyebrow']}>Latest opportunities</p>
          <h2 className={styles['jobs__title']}>
            {humanCategory === 'remote'
              ? 'Remote roles curated for you'
              : `${humanCategory} roles you can do from anywhere`}
          </h2>
        </div>
        <p className={styles['jobs__summary']}>{summaryText}</p>
      </header>

      <ul className={styles['jobs__list']} role='list'>
        {jobs.map((job) => (
          <JobItem
            key={job.id}
            id={job.id}
            title={job.title}
            name={job.company_name}
            logo={job.company_logo}
            type={job.job_type}
            postedAtLabel={timeFormatter(job.publication_date)}
            postedAt={job.publication_date}
            location={job.candidate_required_location}
            salary={job.salary}
            category={job.category}
          />
        ))}
      </ul>
      <Pagination totalPages={totalPages} currentPage={currentPage} />
    </section>
  );
};

export default Jobs;

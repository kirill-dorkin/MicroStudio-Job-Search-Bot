import JobItem from '../components/JobItem';
import Pagination from '../components/Pagination';
import Error from '../components/UI/Error';
import { timeFormatter } from '../lib/utils/helper';

import styles from '../styles/containers/Jobs.module.scss';

const Jobs = ({ jobs = [], totalPages = 0, currentPage = 1, className = '', error }) => {
  const classes = `${styles['jobs']} ${className}`.trim();

  if (error) {
    return <Error message={error} type='api' />;
  }

  if (!jobs.length) {
    return <Error message='Oops!... No results found' />;
  }

  return (
    <ul className={classes}>
      {jobs.map((job) => (
        <JobItem
          key={job.id}
          id={job.id}
          title={job.title}
          name={job.company_name}
          logo={job.company_logo}
          type={job.job_type}
          date={timeFormatter(job.publication_date)}
          location={job.candidate_required_location}
          salary={job.salary}
          category={job.category}
        />
      ))}
      <Pagination totalPages={totalPages} currentPage={currentPage} />
    </ul>
  );
};

export default Jobs;

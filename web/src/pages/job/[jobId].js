
import SEO from '../../components/SEO';
import Job from '../../containers/Job';
import Error from '../../components/UI/Error';
import { getJobById } from '../../lib/api';
import { getJobSeoData } from '../../lib/utils/portfolio';

export const getServerSideProps = async (ctx) => {
  const { jobId } = ctx.params;
  try {
    const job = await getJobById(jobId);
    if (!job) {
      return {
        props: { job: null, error: 'Job not found.' },
      };
    }
    return {
      props: { job, error: null },
    };
  } catch (err) {
    console.error('Failed to load job details', err);
    return {
      props: {
        job: null,
        error: err?.message || 'Unable to load job details right now.',
      },
    };
  }
};

export default function JobPage({ job, error }) {
  if (error) return <Error message={error} type='api' />;
  if (!job) return <Error message='Job not found.' />;
  return (
    <>
      <SEO
        {...getJobSeoData({
          name: job.title,
          company: job.company_name,
          category: job.category,
          salary: job?.salary,
          location: job.candidate_required_location,
        })}
      />
      <Job {...job} />
    </>
  );
}

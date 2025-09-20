import parse from 'html-react-parser';
import Badge from '../components/Badge';
import Button from '../components/Button';
import Company from '../components/Company';
import IconText from '../components/IconText';
import MutedText from '../components/MutedText';
import { timeFormatter } from '../lib/utils/helper';
import { HiArrowNarrowLeft } from 'react-icons/hi';
import { HiArrowNarrowRight } from 'react-icons/hi';
import { useRouter } from 'next/router';
import styles from '../styles/containers/Job.module.scss';

const transformNode = (node) => {
  if (node.type === 'tag' && node.name === 'br') {
    return null;
  }

  if (node.type === 'tag' && node.children?.length === 0) {
    return null;
  }

  if (node.type === 'tag' && node.name === 'a') {
    node.attribs = {
      ...node.attribs,
      target: '_blank',
      rel: 'noopener noreferrer',
    };
  }

  if (
    node.type === 'tag' &&
    (node.name === 'p' || node.name === 'div') &&
    node.children?.length === 1 &&
    node.children[0]?.type === 'text'
  ) {
    if (node.children[0].data?.trim().length === 0) {
      return null;
    }
  }

  return undefined;
};

const Job = ({
  title,
  job_type,
  publication_date,
  company_logo,
  company_name,
  candidate_required_location,
  description,
  url,
  salary,
  category,
}) => {
  const router = useRouter();
  return (
    <section className={styles['job']}>
      <aside className={styles['job__aside']}>
        <Button
          className={styles['aside__back-link']}
          onClick={router.back}
          variant='link'
        >
          <HiArrowNarrowLeft />
          Back to search
        </Button>

        <MutedText className={styles['aside__apply']}>how to apply</MutedText>

        <div className={styles['aside__content']}>
          <p>Please visit the Remotive page for more information</p>

          <Button
            type='link'
            to={url}
            className={styles['aside__button']}
            size='full-width'
            target='_blank'
            rel='noopener noreferrer'
          >
            Apply for this position
            <HiArrowNarrowRight />
          </Button>
        </div>
      </aside>
      <main className={styles['job__main']}>
        <header className={styles['job__header']}>
          <h1 className={`${styles['job__title']} heading-primary`}>{title}</h1>
          {(job_type === 'full_time' || job_type === 'fulltime') && <Badge>Full time</Badge>}
          <Badge variant='fill' className={styles['job__category']}>
            {category}
          </Badge>
          {salary && (
            <h2 className={`${styles['job__salary']} heading-secondary`}>
              {salary}
            </h2>
          )}
        </header>
        <IconText icon='clock'>{timeFormatter(publication_date)}</IconText>

        <Company
          name={company_name}
          logo={company_logo}
          location={candidate_required_location}
          className={styles['job__company']}
        />

        <main className={styles['job__description']}>
          {parse(description || '', { replace: transformNode })}
        </main>
      </main>
    </section>
  );
};

export default Job;

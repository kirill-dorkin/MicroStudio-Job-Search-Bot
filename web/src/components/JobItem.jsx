import Link from 'next/link';
import Badge from './Badge';
import IconText from './IconText';
import CompanyLogo from './Company/CompanyLogo';
import { formatCategoryName } from '../lib/utils/helper';
import styles from '../styles/components/JobItem.module.scss';

const getJobTypeLabel = (type) => {
  if (!type) return 'Flexible';
  const normalized = type.toLowerCase();
  if (normalized === 'full_time' || normalized === 'fulltime') return 'Full time';
  if (normalized === 'contract') return 'Contract';
  return normalized.replace(/_/g, ' ');
};

const JobItem = ({
  id,
  title,
  name,
  logo,
  type,
  postedAt,
  postedAtLabel,
  location,
  salary,
  category,
}) => {
  const jobTypeLabel = getJobTypeLabel(type);
  const formattedCategory = formatCategoryName(category);
  const subtitle = salary
    ? `Earn ${salary} while collaborating remotely with a globally distributed team.`
    : location
    ? `Open to applicants based in ${location}.`
    : 'Work remotely with a distributed team that values async collaboration and focused work.';

  return (
    <li className={styles['job']}>
      <Link
        href={`/job/${id}`}
        className={styles['job__link']}
        aria-label={`View ${title} role at ${name}`}
      >
        <div className={styles['job__header']}>
            <CompanyLogo
              logo={logo}
              name={name}
              className={styles['job__logo']}
            />
            <div className={styles['job__company']}>
              <p className={styles['job__company-name']}>{name}</p>
              {postedAtLabel && (
                <time
                  className={styles['job__posted']}
                  dateTime={postedAt || undefined}
                  aria-label={`Published ${postedAtLabel}`}
                >
                  {postedAtLabel}
                </time>
              )}
            </div>
            <div className={styles['job__badges']}>
              {jobTypeLabel && <Badge className={styles['job__badge']}>{jobTypeLabel}</Badge>}
              {formattedCategory && (
                <Badge variant='fill' className={styles['job__badge']}>
                  {formattedCategory}
                </Badge>
              )}
            </div>
          </div>
          <div className={styles['job__body']}>
            <h3 className={styles['job__title']}>{title}</h3>
            <p className={styles['job__subtitle']}>{subtitle}</p>
          </div>
        <footer className={styles['job__meta']}>
          {salary && <IconText icon='money'>{salary}</IconText>}
          {location && <IconText icon='earth'>{location}</IconText>}
          {postedAtLabel && (
            <IconText icon='clock'>
              <time dateTime={postedAt || undefined}>{postedAtLabel}</time>
            </IconText>
          )}
        </footer>
      </Link>
    </li>
  );
};

export default JobItem;

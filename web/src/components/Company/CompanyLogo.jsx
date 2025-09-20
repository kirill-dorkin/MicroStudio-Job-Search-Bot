import Image from 'next/image';
import styles from '../../styles/components/CompanyLogo.module.scss';

const getInitials = (name = '') => {
  if (!name) return '?';
  const words = name
    .split(' ')
    .map((word) => word.trim())
    .filter(Boolean);
  const initials = words.slice(0, 2).map((word) => word[0]?.toUpperCase() || '');
  return initials.join('') || name.slice(0, 2).toUpperCase();
};

const CompanyLogo = ({ logo, name, size = 'lg', className }) => {
  const radius = size === 'sm' ? 42 : 72;
  const containerClasses = [
    styles.logo,
    styles[`logo--${size}`],
    className,
  ]
    .filter(Boolean)
    .join(' ');

  if (!logo) {
    return (
      <span className={containerClasses} aria-hidden='true'>
        {getInitials(name)}
      </span>
    );
  }

  return (
    <span className={containerClasses}>
      <Image
        src={logo}
        width={radius}
        height={radius}
        layout='fixed'
        alt={`${name} logo`}
        className={styles['logo__image']}
      />
    </span>
  );
};

export default CompanyLogo;

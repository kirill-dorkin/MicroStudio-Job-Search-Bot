import styles from '../styles/components/Badge.module.scss';

const Badge = ({ children, className = '', variant = 'outline' }) => {
  const classes = [styles.badge, className];
  if (variant === 'fill') {
    classes.push(styles['badge--fill']);
  }
  if (variant === 'subtle') {
    classes.push(styles['badge--subtle']);
  }
  return <span className={classes.filter(Boolean).join(' ')}>{children}</span>;
};

export default Badge;

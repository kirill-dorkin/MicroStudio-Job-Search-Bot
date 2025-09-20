import Link from 'next/link';
import styles from '../styles/components/Button.module.scss';

const Button = ({
  children,
  onClick,
  type = 'button',
  variant = 'solid',
  className = '',
  size = '',
  to = '/',
  ...props
}) => {
  const classes = `${styles.button} ${className} ${styles[variant]} ${
    size ? styles[size] : ''
  }`;

  if (type === 'link') {
    return (
      <Link href={to} className={classes} {...props}>
        {children}
      </Link>
    );
  }

  return (
    <button type={type} className={classes} onClick={onClick} {...props}>
      {children}
    </button>
  );
};

export default Button;

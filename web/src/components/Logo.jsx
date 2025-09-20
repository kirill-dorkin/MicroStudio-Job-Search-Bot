import Link from 'next/link';
import classes from '../styles/components/Logo.module.scss';

const Logo = ({ name, href = '/' }) => {
  const [firstName, ...rest] = name.split(' ');

  return (
    <Link href={href} className={classes.logo}>
      <span className={classes['logo--main']}>{firstName} </span>
      <span className={classes['logo--sub']}>{rest.join(' ')}</span>
    </Link>
  );
};

export default Logo;

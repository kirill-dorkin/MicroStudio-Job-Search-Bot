import Icon from './Icon';
import styles from '../styles/components/IconText.module.scss';

const IconText = ({ icon, children, className = '' }) => {
  const classes = [className, styles['info__content']]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={classes}>
      {icon && <Icon type={icon} />}
      <span className={styles['info__text']}>{children}</span>
    </div>
  );
};

export default IconText;

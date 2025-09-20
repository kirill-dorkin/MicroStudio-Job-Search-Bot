import { formatCategoryName, getId } from '../../lib/utils/helper';
import styles from '../../styles/components/Select.module.scss';

const Select = ({ options, onChange, value }) => {
  const changeHandler = (e) => {
    const selected = e.target.value;
    onChange(selected);
  };

  return (
    <select
      value={value}
      className={styles['select']}
      onChange={changeHandler}
      aria-label='Filter by job category'
    >
      <option value="all">all categories</option>
      {options.map((category) => (
        <option key={getId()} value={category}>
          {formatCategoryName(category)}
        </option>
      ))}
    </select>
  );
};

export default Select;

import { useEffect, useState } from 'react';
import styles from '../../styles/components/SearchBar.module.scss';

const SearchBar = ({
  icon,
  placeholder,
  className,
  Button = null,
  defaultValue = '',
  value: controlledValue,
  onChange,
  onSubmit,
  submitLabel = 'Search',
  label = '',
  inputId = 'search-input',
  ...props
}) => {
  const [value, setValue] = useState(
    controlledValue !== undefined ? controlledValue : defaultValue
  );

  useEffect(() => {
    if (controlledValue !== undefined) {
      setValue(controlledValue);
    }
  }, [controlledValue]);

  useEffect(() => {
    if (controlledValue === undefined) {
      setValue(defaultValue);
    }
  }, [defaultValue, controlledValue]);

  const classes = [styles['search-bar'], className].filter(Boolean).join(' ');

  const changeHandler = (e) => {
    const searchValue = e.target.value.trimStart();
    setValue(searchValue);
    if (!onChange) return;
    onChange(searchValue);
  };

  const submitHandler = (e) => {
    e.preventDefault();
    if (!onSubmit) return;
    const trimmed = value.trim();
    if (!trimmed) return;
    onSubmit(trimmed);
  };

  return (
    <form
      className={classes}
      role='search'
      autoComplete='off'
      onSubmit={submitHandler}
      {...props}
    >
      {icon && <span className={styles['search-bar__icon']}>{icon}</span>}
      <div className={styles['search-bar__field']}>
        {label && (
          <label htmlFor={inputId} className='visually-hidden'>
            {label}
          </label>
        )}
        <input
          type='search'
          name='search'
          id={inputId}
          value={value}
          onChange={changeHandler}
          className={styles['search-bar__input']}
          placeholder={placeholder}
          aria-label={label || placeholder}
        />
      </div>
      {Button && <div className={styles['search-bar__control']}>{Button}</div>}
      <button type='submit' className={styles['search-bar__submit']}>
        {submitLabel}
      </button>
    </form>
  );
};

export default SearchBar;

import { useRouter } from 'next/router';
import { useMemo, useState } from 'react';
import Form from '../components/Form';
import Input from '../components/Form/Input';
import SearchBar from '../components/Form/SearchBar';
import MutedText from '../components/MutedText';
import Icon from '../components/Icon';
import Button from '../components/Button';
import styles from '../styles/containers/Filter.module.scss';
import { MAX_LOCATIONS } from '../lib/utils/constant';

const Filter = ({ className = '', fullTime, locations, selectedLocation }) => {
  const router = useRouter();
  const [searchLocation, setSearchLocation] = useState('');
  const allLocations = useMemo(
    () => [...locations.all, ...locations.others],
    [locations.all, locations.others]
  );

  const hasActiveFilters =
    fullTime || (selectedLocation && selectedLocation !== 'all');

  const searchedLocations = useMemo(() => {
    const value = searchLocation.toLowerCase();
    return allLocations
      .filter((location) => location.toLowerCase().includes(value))
      .slice(0, MAX_LOCATIONS + 2);
  }, [allLocations, searchLocation]);

  const { all, others } = locations;

  const availableLocations = useMemo(() => {
    if (!all.length && !others.length) return ['all'];
    if (others.length) {
      return ['all', ...all, 'others'];
    }
    return ['all', ...all];
  }, [all, others]);

  const classes = [styles.filter, className].filter(Boolean).join(' ');

  const pushWithQuery = (nextQuery) => {
    router.push({ pathname: router.pathname, query: nextQuery }, undefined, {
      scroll: false,
    });
  };

  const locationChangeHandler = (event) => {
    const value = event.target.value;
    const nextQuery = { ...router.query, page: 1 };
    if (!value || value === 'all') {
      delete nextQuery.location;
    } else {
      nextQuery.location = value;
    }
    pushWithQuery(nextQuery);
  };

  const locationSearchHandler = (location) => {
    setSearchLocation(location);
  };

  const fullTimeChangeHandler = (event) => {
    const checked = event.target.checked;
    const nextQuery = { ...router.query, page: 1 };
    if (checked) {
      nextQuery.fullTime = 1;
    } else {
      delete nextQuery.fullTime;
    }
    pushWithQuery(nextQuery);
  };

  const clearFiltersHandler = () => {
    const nextQuery = { ...router.query };
    delete nextQuery.fullTime;
    delete nextQuery.location;
    delete nextQuery.page;
    setSearchLocation('');
    pushWithQuery(nextQuery);
  };

  const inputs = searchLocation ? searchedLocations : availableLocations;
  const hasSearchQuery = searchLocation.trim().length > 0;

  return (
    <aside className={classes}>
      <div className={styles['filter__header']}>
        <Input
          type='checkbox'
          name='fullTime'
          label='Full time only'
          defaultChecked={fullTime}
          onChange={fullTimeChangeHandler}
        />
        <Button
          type='button'
          variant='link'
          className={styles['filter__clear']}
          onClick={clearFiltersHandler}
          disabled={!hasActiveFilters}
        >
          Clear filters
        </Button>
      </div>

      <MutedText className={styles['filter__heading']}>
        Filter by location
      </MutedText>

      <SearchBar
        placeholder='City, state, zip code or country'
        icon={<Icon />}
        onChange={locationSearchHandler}
        value={searchLocation}
        label='Filter jobs by location'
        className={styles['filter__search']}
        submitLabel='Filter'
        inputId='location-search'
        onSubmit={locationSearchHandler}
      />

      {hasSearchQuery && (
        <p className={styles['filter__results']}>
          Showing {inputs.length} {inputs.length === 1 ? 'match' : 'matches'}
        </p>
      )}

      <Form
        className={styles['filter__form']}
        onChange={locationChangeHandler}
        inputs={inputs}
        value={selectedLocation}
      />
    </aside>
  );
};

export default Filter;

import { Fragment, useMemo } from 'react';
import { useRouter } from 'next/router';
import { IoBriefcaseOutline } from 'react-icons/io5';
import SearchBar from '../components/Form/SearchBar';
import Select from '../components/Form/Select';
import { formatCategoryName, formatNumber } from '../lib/utils/helper';
import styles from '../styles/containers/Hero.module.scss';

const formatTrendingCategories = (categories = [], selectedCategory) => {
  if (!Array.isArray(categories)) return [];
  const unique = Array.from(new Set(categories.filter(Boolean)));
  if (!unique.length) return [];
  return unique
    .filter((category) => category !== selectedCategory)
    .slice(0, 6);
};

const Hero = ({
  categories = [],
  selectedCategory = 'all',
  search = '',
  totalResults = 0,
}) => {
  const router = useRouter();

  const formattedCategory =
    selectedCategory && selectedCategory !== 'all'
      ? formatCategoryName(selectedCategory)
      : '';
  const fallbackCategory = formattedCategory || 'remote';
  const lowercaseCategory = fallbackCategory.toLowerCase();

  const heroTitle =
    selectedCategory === 'all'
      ? 'Find your next remote job faster'
      : `Explore remote ${fallbackCategory} roles`;

  const heroDescription =
    selectedCategory === 'all'
      ? 'Search curated roles from companies that embrace remote-first cultures. Tailor your query, filter by time zone or contract type, and land where you can thrive.'
      : `Discover hand-picked ${lowercaseCategory} opportunities without borders. Filter by time zone, contract type, or keywords to uncover your perfect match.`;

  const trendingCategories = useMemo(
    () => formatTrendingCategories(categories, selectedCategory),
    [categories, selectedCategory]
  );

  const categoriesChangeHandler = (category) => {
    if (category === 'all') {
      router.push('/');
      return;
    }
    router.push(`/category/${category}`);
  };

  const submitHandler = (value) => {
    const trimmed = value.trim();
    if (!trimmed) return;
    const baseURL =
      selectedCategory === 'all' || selectedCategory === ''
        ? ''
        : `category/${selectedCategory}`;
    router.push({
      pathname: `/${baseURL}`,
      query: { search: trimmed },
    });
  };

  const stats = [
    {
      label: 'Open roles',
      value:
        totalResults > 999
          ? `${formatNumber(totalResults, {
              notation: 'compact',
              maximumFractionDigits: 1,
            })}+`
          : formatNumber(totalResults),
    },
    { label: 'Categories', value: formatNumber(categories?.length || 0) },
  ];

  return (
    <section className={styles.hero} aria-labelledby='search-heading'>
      <div className={styles['hero__body']}>
        <div className={styles['hero__intro']}>
          <p className={styles['hero__eyebrow']}>Remote opportunities for everyone</p>
          <h1 id='search-heading' className={styles['hero__title']}>
            {heroTitle}
          </h1>
          <p className={styles['hero__description']}>
            {heroDescription}
            {search && (
              <Fragment>
                {' '}
                <strong>
                  Showing matches for “
                  {search}
                  ”
                </strong>
              </Fragment>
            )}
          </p>
        </div>
        <div className={styles['hero__actions']}>
          <SearchBar
            icon={<IoBriefcaseOutline aria-hidden='true' />}
            placeholder='Title, company, seniority, or benefits'
            submitLabel='Search'
            defaultValue={search}
            onSubmit={submitHandler}
            label='Search remote jobs'
            inputId='job-search'
            Button={
              <Select
                options={categories}
                onChange={categoriesChangeHandler}
                value={selectedCategory}
              />
            }
            className={styles['hero__search-bar']}
          />
          {Boolean(trendingCategories.length) && (
            <div className={styles['hero__trending']}>
              <span aria-hidden='true'>Trending:</span>
              <div className={styles['hero__chips']}>
                {trendingCategories.map((category) => (
                  <button
                    key={category}
                    type='button'
                    onClick={() => categoriesChangeHandler(category)}
                    className={styles['hero__chip']}
                    aria-label={`View ${formatCategoryName(category)} jobs`}
                  >
                    {formatCategoryName(category)}
                  </button>
                ))}
              </div>
            </div>
          )}
          <dl className={styles['hero__stats']}>
            {stats.map(({ label, value }) => (
              <div key={label} className={styles['hero__stat']}>
                <dt>{label}</dt>
                <dd>{value}</dd>
              </div>
            ))}
          </dl>
        </div>
      </div>
    </section>
  );
};

export default Hero;

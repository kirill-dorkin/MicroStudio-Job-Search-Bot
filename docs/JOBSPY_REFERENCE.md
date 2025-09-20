# JobSpy Reference

Этот документ содержит справочную информацию из оригинальной документации JobSpy, перенесённую из основного README.

## FAQ
### Q: No results when using "google"?
**A:** You have to use super specific syntax. Search for Google Jobs in your browser and copy the query that появляется в поисковой строке Google Jobs после применения фильтров. Эту строку нужно передать в параметр `google_search_term`.

### Q: Received a response code 429?
**A:** Это означает, что площадка заблокировала частые запросы. Рекомендуем:
- Делать паузы между скрейпингом (зависит от площадки).
- Использовать параметр `proxies`, чтобы сменить IP-адрес.

## JobPost Schema
```text
JobPost
├── title
├── company
├── company_url
├── job_url
├── location
│   ├── country
│   ├── city
│   ├── state
├── is_remote
├── description
├── job_type: fulltime, parttime, internship, contract
├── job_function
│   ├── interval: yearly, monthly, weekly, daily, hourly
│   ├── min_amount
│   ├── max_amount
│   ├── currency
│   └── salary_source: direct_data, description (parsed from posting)
├── date_posted
└── emails

LinkedIn specific
└── job_level

LinkedIn & Indeed specific
└── company_industry

Indeed specific
├── company_country
├── company_addresses
├── company_employees_label
├── company_revenue_label
├── company_description
└── company_logo

Naukri specific
├── skills
├── experience_range
├── company_rating
├── company_reviews_count
├── vacancy_count
└── work_from_home_type
```


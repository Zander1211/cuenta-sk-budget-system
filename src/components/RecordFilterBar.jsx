import { RotateCcw, Search, SlidersHorizontal } from 'lucide-react'
import { monthOptions } from '../utils/analytics'
import YearSpinner from './YearSpinner'

export default function RecordFilterBar({
  searchValue,
  onSearchChange,
  searchLabel,
  searchPlaceholder,
  dateValue,
  onDateChange,
  monthValue,
  onMonthChange,
  yearValue,
  onYearChange,
  categoryValue,
  onCategoryChange,
  categoryOptions = [],
  statusValue,
  onStatusChange,
  hasActiveFilters,
  onReset,
  resultCount,
  totalCount,
}) {
  return (
    <section className="record-filter-panel" aria-labelledby="record-filter-title">
      <div className="record-filter-heading">
        <div>
          <span className="record-filter-kicker">
            <SlidersHorizontal size={15} aria-hidden="true" />
            Refine records
          </span>
          <h2 id="record-filter-title">Filters</h2>
        </div>
        <span className="record-filter-count" aria-live="polite">
          {resultCount} of {totalCount} {totalCount === 1 ? 'record' : 'records'}
        </span>
      </div>

      <div className={`record-filter-grid ${onCategoryChange ? '' : 'record-filter-grid--payroll'}`}>
        <label className="record-filter-field record-filter-field--search">
          <span>{searchLabel}</span>
          <span className="record-filter-search-wrap">
            <Search size={17} aria-hidden="true" />
            <input
              type="search"
              value={searchValue}
              onChange={(event) => onSearchChange(event.target.value)}
              placeholder={searchPlaceholder}
              autoComplete="off"
            />
          </span>
        </label>

        <label className="record-filter-field">
          <span>Specific date</span>
          <input type="date" value={dateValue} onChange={(event) => onDateChange(event.target.value)} />
        </label>

        <label className="record-filter-field">
          <span>Month</span>
          <select value={monthValue} onChange={(event) => onMonthChange(event.target.value)}>
            <option value="All">All months</option>
            {monthOptions.map((month) => (
              <option key={month.value} value={month.value}>{month.label}</option>
            ))}
          </select>
        </label>

        <div className="record-filter-field record-filter-field--year">
          <span>Year</span>
          <YearSpinner year={yearValue} onYearChange={onYearChange} />
        </div>

        {onCategoryChange ? (
          <label className="record-filter-field">
            <span>Category</span>
            <select value={categoryValue} onChange={(event) => onCategoryChange(event.target.value)}>
              <option value="All">All categories</option>
              {categoryOptions.map((category) => (
                <option key={category} value={category}>{category}</option>
              ))}
            </select>
          </label>
        ) : null}

        <label className="record-filter-field">
          <span>Status</span>
          <select value={statusValue} onChange={(event) => onStatusChange(event.target.value)}>
            <option value="All">All statuses</option>
            <option value="Ongoing">Ongoing</option>
            <option value="Completed">Completed</option>
          </select>
        </label>

        <button
          type="button"
          className="record-filter-reset"
          onClick={onReset}
          disabled={!hasActiveFilters}
        >
          <RotateCcw size={16} aria-hidden="true" />
          Reset filters
        </button>
      </div>
    </section>
  )
}

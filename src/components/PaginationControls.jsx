import { ChevronLeft, ChevronRight } from 'lucide-react'

function getVisiblePages(currentPage, totalPages) {
  const visibleCount = Math.min(totalPages, 7)
  let firstPage = 1

  if (totalPages > visibleCount) {
    firstPage = Math.min(
      Math.max(currentPage - Math.floor(visibleCount / 2), 1),
      totalPages - visibleCount + 1,
    )
  }

  return Array.from({ length: visibleCount }, (_, index) => firstPage + index)
}

export default function PaginationControls({
  currentPage,
  totalPages,
  totalItems,
  pageSize,
  onPageChange,
  isLoading = false,
  isFiltered = false,
  idPrefix = 'records',
}) {
  const safeTotalPages = Math.max(1, Number(totalPages) || 1)
  const safeCurrentPage = Math.min(Math.max(1, Number(currentPage) || 1), safeTotalPages)
  const safeTotalItems = Math.max(0, Number(totalItems) || 0)
  const firstItem = safeTotalItems === 0 ? 0 : (safeCurrentPage - 1) * pageSize + 1
  const lastItem = Math.min(safeCurrentPage * pageSize, safeTotalItems)

  function goToPage(page) {
    const nextPage = Math.min(Math.max(1, page), safeTotalPages)
    if (!isLoading && nextPage !== safeCurrentPage) onPageChange(nextPage)
  }

  return (
    <>
      {safeTotalPages > 1 ? (
        <nav className="audit-pagination" aria-label="Pagination">
          <button
            type="button"
            className="secondary-button audit-page-btn"
            id={`${idPrefix}-prev-page`}
            onClick={() => goToPage(safeCurrentPage - 1)}
            disabled={safeCurrentPage <= 1 || isLoading}
            aria-label="Previous page"
          >
            <ChevronLeft size={16} />
            Previous
          </button>

          <div className="audit-page-numbers">
            {getVisiblePages(safeCurrentPage, safeTotalPages).map((page) => (
              <button
                key={page}
                type="button"
                className={`audit-page-number${page === safeCurrentPage ? ' is-active' : ''}`}
                onClick={() => goToPage(page)}
                disabled={isLoading}
                aria-label={`Go to page ${page}`}
                aria-current={page === safeCurrentPage ? 'page' : undefined}
              >
                {page}
              </button>
            ))}
          </div>

          <button
            type="button"
            className="secondary-button audit-page-btn"
            id={`${idPrefix}-next-page`}
            onClick={() => goToPage(safeCurrentPage + 1)}
            disabled={safeCurrentPage >= safeTotalPages || isLoading}
            aria-label="Next page"
          >
            Next
            <ChevronRight size={16} />
          </button>
        </nav>
      ) : null}

      <p className="audit-pagination-info">
        Showing {firstItem}–{lastItem} of {safeTotalItems.toLocaleString()} records
        {isFiltered ? ' (filtered)' : ''}
      </p>
    </>
  )
}

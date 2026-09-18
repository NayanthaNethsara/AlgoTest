"use client";

import { useEffect, useMemo, useState } from "react";

export const PAGE_SIZE_OPTIONS = [10, 25, 50, 100];

export type PaginationState<T> = {
  page: number;
  pageSize: number;
  pageCount: number;
  totalItems: number;
  /** 1-based index of the first visible row, 0 when the list is empty. */
  firstItem: number;
  lastItem: number;
  items: T[];
  setPage: (page: number) => void;
  setPageSize: (size: number) => void;
};

/**
 * Client-side pagination over an already-filtered list.
 *
 * The page is clamped rather than reset whenever the list shrinks, so deleting
 * the last row of page 4 lands on page 3 instead of throwing the organizer back
 * to the top of the table.
 */
export function usePagination<T>(items: T[], initialPageSize = 25): PaginationState<T> {
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(initialPageSize);

  const totalItems = items.length;
  const pageCount = Math.max(1, Math.ceil(totalItems / pageSize));
  const safePage = Math.min(page, pageCount);

  useEffect(() => {
    if (page !== safePage) setPage(safePage);
  }, [page, safePage]);

  const pageItems = useMemo(() => {
    const start = (safePage - 1) * pageSize;
    return items.slice(start, start + pageSize);
  }, [items, safePage, pageSize]);

  return {
    page: safePage,
    pageSize,
    pageCount,
    totalItems,
    firstItem: totalItems === 0 ? 0 : (safePage - 1) * pageSize + 1,
    lastItem: Math.min(safePage * pageSize, totalItems),
    items: pageItems,
    setPage: (next) => setPage(Math.min(Math.max(1, next), pageCount)),
    setPageSize: (size) => {
      setPageSize(size);
      setPage(1);
    },
  };
}

/** Page numbers to render, with `null` standing in for an ellipsis. */
export function pageWindow(page: number, pageCount: number, maxSlots = 7): (number | null)[] {
  if (pageCount <= maxSlots) {
    return Array.from({ length: pageCount }, (_, i) => i + 1);
  }

  const slots = new Set<number>([1, pageCount, page]);
  for (let offset = 1; slots.size < maxSlots - 2 && offset <= pageCount; offset++) {
    if (page - offset > 1) slots.add(page - offset);
    if (slots.size < maxSlots - 2 && page + offset < pageCount) slots.add(page + offset);
  }

  const ordered = [...slots].sort((a, b) => a - b);
  const result: (number | null)[] = [];
  for (let i = 0; i < ordered.length; i++) {
    if (i > 0 && ordered[i] - ordered[i - 1] > 1) result.push(null);
    result.push(ordered[i]);
  }
  return result;
}

export type ServerPaginationOptions<T> = {
  items: T[];
  total: number;
  page: number;
  pageSize: number;
  onPageChange: (page: number) => void;
  onPageSizeChange: (size: number) => void;
};

export function useServerPagination<T>({
  items,
  total,
  page,
  pageSize,
  onPageChange,
  onPageSizeChange,
}: ServerPaginationOptions<T>): PaginationState<T> {
  const pageCount = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(Math.max(1, page), pageCount);

  return {
    page: safePage,
    pageSize,
    pageCount,
    totalItems: total,
    firstItem: total === 0 ? 0 : (safePage - 1) * pageSize + 1,
    lastItem: Math.min(safePage * pageSize, total),
    items,
    setPage: onPageChange,
    setPageSize: onPageSizeChange,
  };
}

"use client";

import { ChevronLeftIcon, ChevronRightIcon } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Pagination,
  PaginationContent,
  PaginationEllipsis,
  PaginationItem,
} from "@/components/ui/pagination";
import { SimpleSelect } from "@/components/ui/simple-select";
import { PAGE_SIZE_OPTIONS, pageWindow, type PaginationState } from "@/hooks/use-pagination";
import { cn } from "@/lib/utils";

/**
 * The footer for every paginated table: row range on the left, page size and
 * page controls on the right. It stays mounted on a single page so the row
 * count never disappears from under the organizer mid-task.
 */
export function DataPagination<T>({
  state,
  itemLabel = "row",
  compact = false,
  className,
}: {
  state: PaginationState<T>;
  itemLabel?: string;
  /** Drops the page-size picker and numbered buttons, for narrow side panels. */
  compact?: boolean;
  className?: string;
}) {
  const { page, pageCount, pageSize, totalItems, firstItem, lastItem, setPage, setPageSize } =
    state;

  const plural = totalItems === 1 ? itemLabel : `${itemLabel}s`;

  return (
    <div
      className={cn(
        "flex flex-col items-center justify-between gap-3 border-t px-3 py-2.5 sm:flex-row",
        className
      )}
    >
      <p className="text-[11px] text-muted-foreground" aria-live="polite">
        {totalItems === 0 ? (
          `No ${itemLabel}s`
        ) : (
          <>
            Showing <span className="font-medium text-foreground">{firstItem}</span>–
            <span className="font-medium text-foreground">{lastItem}</span> of{" "}
            <span className="font-medium text-foreground">{totalItems}</span> {plural}
          </>
        )}
      </p>

      <div className="flex items-center gap-3">
        {!compact && (
          <div className="flex items-center gap-1.5">
            <label htmlFor="page-size" className="text-[11px] text-muted-foreground">
              Per page
            </label>
            <SimpleSelect
              id="page-size"
              size="sm"
              value={String(pageSize)}
              onValueChange={(v) => setPageSize(Number(v))}
              options={PAGE_SIZE_OPTIONS.map((n) => ({ value: String(n), label: String(n) }))}
              aria-label="Rows per page"
              className="w-18 text-xs"
            />
          </div>
        )}

        <Pagination className="mx-0 w-auto justify-end">
          <PaginationContent>
            <PaginationItem>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPage(page - 1)}
                disabled={page <= 1}
                aria-label="Previous page"
              >
                <ChevronLeftIcon />
              </Button>
            </PaginationItem>

            {compact ? (
              <PaginationItem>
                <span className="px-2 text-[11px] text-muted-foreground tabular-nums">
                  {page} / {pageCount}
                </span>
              </PaginationItem>
            ) : (
              pageWindow(page, pageCount).map((slot, i) =>
                slot === null ? (
                  <PaginationItem key={`gap-${i}`}>
                    <PaginationEllipsis className="size-7" />
                  </PaginationItem>
                ) : (
                  <PaginationItem key={slot}>
                    <Button
                      variant={slot === page ? "outline" : "ghost"}
                      size="icon-sm"
                      onClick={() => setPage(slot)}
                      aria-label={`Page ${slot}`}
                      aria-current={slot === page ? "page" : undefined}
                      className="text-xs tabular-nums"
                    >
                      {slot}
                    </Button>
                  </PaginationItem>
                )
              )
            )}

            <PaginationItem>
              <Button
                variant="ghost"
                size="icon-sm"
                onClick={() => setPage(page + 1)}
                disabled={page >= pageCount}
                aria-label="Next page"
              >
                <ChevronRightIcon />
              </Button>
            </PaginationItem>
          </PaginationContent>
        </Pagination>
      </div>
    </div>
  );
}

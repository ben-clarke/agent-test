import type { Asset } from "@library/schemas";
import type { AssetListState } from "../../hooks/use-asset-list.ts";
import { BookCount } from "./book-count.tsx";
import { BookListError } from "./book-list-error.tsx";
import { BookListEmpty } from "./book-list-empty.tsx";
import { BookListLoading } from "./book-list-loading.tsx";
import { BookListRejectedNote } from "./book-list-rejected-note.tsx";
import { BookTable } from "./book-table.tsx";

export const BookList = ({
  listState,
  isReloading,
  hasActiveFilters,
  onRetry,
}: BookListProps): React.JSX.Element => (
  <div>
    {listState.status === "loading" && <BookListLoading />}
    {listState.status === "unavailable" && <BookListError onRetry={onRetry} />}
    {listState.status === "loaded" && listState.items.length === 0 && (
      <BookListEmpty hasActiveFilters={hasActiveFilters} />
    )}
    <div aria-live="polite">{listState.status === "rejected" && <BookListRejectedNote />}</div>
    {hasItems(listState) && listState.items.length > 0 && (
      <BookTable
        books={listState.items}
        isBusy={isReloading}
        isDimmed={listState.status === "rejected"}
      />
    )}
    <BookCount bookCount={hasItems(listState) ? listState.items.length : undefined} />
  </div>
);

const hasItems = (
  listState: AssetListState,
): listState is Extract<AssetListState, { readonly items: readonly Asset[] }> =>
  listState.status === "loaded" || listState.status === "rejected";

interface BookListProps {
  readonly listState: AssetListState;
  readonly isReloading: boolean;
  readonly hasActiveFilters: boolean;
  readonly onRetry: () => void;
}

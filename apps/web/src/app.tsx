import { useState } from "react";
import { hasActiveFilters, NO_FILTERS, type AssetFilterValues } from "./api/build-asset-query.ts";
import { BookFilters } from "./components/book-filters/book-filters.tsx";
import { BookList } from "./components/book-list/book-list.tsx";
import { PageSection } from "./components/layout/page-section.tsx";
import { RegisterBookForm } from "./components/register-book-form/register-book-form.tsx";
import { useFocusAfterRetry } from "./hooks/use-focus-after-retry.ts";
import { useAssetList } from "./hooks/use-asset-list.ts";

export const App = (): React.JSX.Element => {
  const [appliedFilters, setAppliedFilters] = useState<AssetFilterValues>(NO_FILTERS);
  const { listState, isReloading, reload } = useAssetList({ filters: appliedFilters });

  const { headingRef, retry } = useFocusAfterRetry({
    listState,
    isReloading,
    reload,
    filters: appliedFilters,
  });

  return (
    <main className="mx-auto flex w-full max-w-4xl flex-col gap-8 p-4 text-slate-900">
      <h1 className="text-2xl font-bold">Library books</h1>
      <PageSection id="register-book-heading" title="Register a book">
        <RegisterBookForm
          onRegistered={reload}
          isReloading={isReloading}
          listedBooks={listState.status === "loaded" ? listState.items : undefined}
        />
      </PageSection>
      <PageSection id="find-books-heading" title="Find books" headingRef={headingRef}>
        <BookFilters
          onApply={setAppliedFilters}
          rejection={listState.status === "rejected" ? listState.details : undefined}
        />
        <BookList
          listState={listState}
          isReloading={isReloading}
          hasActiveFilters={hasActiveFilters(appliedFilters)}
          onRetry={retry}
        />
      </PageSection>
    </main>
  );
};

export const BookListEmpty = ({ hasActiveFilters }: BookListEmptyProps): React.JSX.Element => (
  <p className="text-slate-600">
    {hasActiveFilters ? "No books match these filters." : "No books registered yet."}
  </p>
);

interface BookListEmptyProps {
  readonly hasActiveFilters: boolean;
}

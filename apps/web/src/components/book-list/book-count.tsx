export const BookCount = ({ bookCount }: BookCountProps): React.JSX.Element => (
  <output aria-live="polite" className="sr-only">
    {bookCount === undefined ? "" : formatBookCount(bookCount)}
  </output>
);

const formatBookCount = (bookCount: number): string =>
  bookCount === 1 ? "1 book shown" : `${bookCount} books shown`;

interface BookCountProps {
  readonly bookCount?: number;
}

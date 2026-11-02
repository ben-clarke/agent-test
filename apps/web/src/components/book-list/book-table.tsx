import type { Asset } from "@library/schemas";
import { BookRow } from "./book-row.tsx";

export const BookTable = ({ books, isBusy, isDimmed }: BookTableProps): React.JSX.Element => (
  <section
    aria-label="Books list"
    // oxlint-disable-next-line jsx-a11y/no-noninteractive-tabindex -- scrollable region must be keyboard focusable (WCAG 2.1.1)
    tabIndex={0}
    className="overflow-x-auto focus-visible:outline-2 focus-visible:outline-blue-600"
  >
    <table
      aria-busy={isBusy}
      className={isBusy || isDimmed ? "w-full bg-slate-100 text-left" : "w-full text-left"}
    >
      <caption className="sr-only">Registered books</caption>
      <thead>
        <tr>
          {COLUMN_HEADINGS.map((heading) => (
            <th key={heading} scope="col" className="p-2">
              {heading}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {books.map((book) => (
          <BookRow key={book.id} book={book} />
        ))}
      </tbody>
    </table>
  </section>
);

const COLUMN_HEADINGS: readonly string[] = ["Title", "Author", "ISBN", "Year", "Genre"];

interface BookTableProps {
  readonly books: readonly Asset[];
  readonly isBusy: boolean;
  readonly isDimmed: boolean;
}

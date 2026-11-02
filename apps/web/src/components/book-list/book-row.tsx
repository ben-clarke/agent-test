import type { Asset } from "@library/schemas";
import { GENRE_LABELS, NO_GENRE_LABEL } from "../../genre-labels.ts";

export const BookRow = ({ book }: BookRowProps): React.JSX.Element => (
  <tr className="border-t border-slate-200">
    <td className="p-2">{book.title}</td>
    <td className="p-2">{book.author}</td>
    <td className="p-2">{book.isbn}</td>
    <td className="p-2">{book.publishedYear}</td>
    <td className="p-2">{book.genre === null ? NO_GENRE_LABEL : GENRE_LABELS[book.genre]}</td>
  </tr>
);

interface BookRowProps {
  readonly book: Asset;
}

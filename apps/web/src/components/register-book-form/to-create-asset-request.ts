import type { CreateAssetRequest } from "../../api/register-asset.ts";

export const toCreateAssetRequest = (values: BookFormValues): CreateAssetRequest => {
  const { title, author, isbn, publishedYear, genre } = values;
  const year = publishedYear.trim();

  return {
    title,
    author,
    isbn,
    ...(year === "" ? {} : { publishedYear: DIGITS_ONLY.test(year) ? Number(year) : year }),
    ...(genre === "" ? {} : { genre }),
  };
};

const DIGITS_ONLY = /^\d+$/;

export interface BookFormValues {
  readonly title: string;
  readonly author: string;
  readonly isbn: string;
  readonly publishedYear: string;
  readonly genre: string;
}

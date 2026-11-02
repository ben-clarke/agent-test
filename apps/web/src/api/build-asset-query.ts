export const buildAssetQuery = ({
  author,
  title,
  publishedYear,
  genre,
}: AssetFilterValues): URLSearchParams =>
  new URLSearchParams(
    Object.entries({ author, q: title, publishedYear, genre }).filter(
      ([, value]) => value.trim() !== "",
    ),
  );

export const hasActiveFilters = (filters: AssetFilterValues): boolean =>
  buildAssetQuery(filters).size > 0;

export const NO_FILTERS: AssetFilterValues = {
  author: "",
  title: "",
  publishedYear: "",
  genre: "",
};

export interface AssetFilterValues {
  readonly author: string;
  readonly title: string;
  readonly publishedYear: string;
  readonly genre: string;
}

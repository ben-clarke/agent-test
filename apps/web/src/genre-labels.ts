import type { Genre } from "@library/schemas";

export const NO_GENRE_LABEL = "No genre";

export const GENRE_LABELS: Readonly<Record<Genre, string>> = {
  fiction: "Fiction",
  "non-fiction": "Non-fiction",
  "science-fiction": "Science fiction",
  fantasy: "Fantasy",
  mystery: "Mystery",
  biography: "Biography",
  history: "History",
  children: "Children",
  poetry: "Poetry",
  other: "Other",
};

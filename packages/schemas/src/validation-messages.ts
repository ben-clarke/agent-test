export const buildYearOutOfRangeMessage = ({
  earliestYear,
  currentYear,
}: {
  readonly earliestYear: number;
  readonly currentYear: number;
}): string => `Year must be a whole number from ${earliestYear} to ${currentYear}`;

export const buildUnrecognisedFieldMessage = (field: string): string =>
  `"${field}" is not a recognised field`;

export const buildUnrecognisedFilterMessage = (filter: string): string =>
  `"${filter}" is not a recognised filter`;

export const buildRepeatedFilterMessage = (filter: string): string =>
  `Give the "${filter}" filter only once`;

export const MAX_TEXT_LENGTH = 200;
export const MAX_YEAR_FILTER_DIGITS = 4;

export const VALIDATION_MESSAGES = {
  titleRequired: "Enter a title",
  authorRequired: "Enter an author",
  titleTooLong: `Title must be ${MAX_TEXT_LENGTH} characters or fewer`,
  authorTooLong: `Author must be ${MAX_TEXT_LENGTH} characters or fewer`,
  isbnRequired: "Enter an ISBN",
  isbnInvalid: "Enter a valid 10- or 13-digit ISBN — check for typos",
  yearRequired: "Enter a year",
  publishedYearFilterInvalid: `Year must be a whole number of up to ${MAX_YEAR_FILTER_DIGITS} digits, for example 1965`,
  genreInvalid: "Choose a genre from the list",
  isbnDuplicate: "A book with this ISBN is already registered — find it in the list",
  bodyNotJsonObject: "Send the book details as a JSON object",
} as const;

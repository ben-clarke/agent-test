import { z } from "zod";
import { GenreSchema } from "./genre-schema.ts";
import {
  buildRepeatedFilterMessage,
  MAX_YEAR_FILTER_DIGITS,
  VALIDATION_MESSAGES,
} from "./validation-messages.ts";

const OptionalTrimmedText = z
  .string({ error: (issue) => describeRepeatedFilter(issue) })
  .trim()
  .transform((value) => (value === "" ? undefined : value))
  .optional();

const YEAR_FILTER_PATTERN = new RegExp(`^\\d{1,${MAX_YEAR_FILTER_DIGITS}}$`);

const PublishedYearFilter = OptionalTrimmedText.pipe(
  z
    .string()
    .regex(YEAR_FILTER_PATTERN, { error: VALIDATION_MESSAGES.publishedYearFilterInvalid })
    .transform(Number)
    .optional(),
);

const GenreFilter = OptionalTrimmedText.transform((value) => value?.toLowerCase()).pipe(
  z.enum(GenreSchema.options, { error: VALIDATION_MESSAGES.genreInvalid }).optional(),
);

export const AssetFilterSchema = z
  .object({
    author: OptionalTrimmedText,
    q: OptionalTrimmedText,
    publishedYear: PublishedYearFilter,
    genre: GenreFilter,
  })
  .strict();

export type AssetFilter = z.output<typeof AssetFilterSchema>;

const describeRepeatedFilter = (issue: z.core.$ZodRawIssue): string | undefined => {
  if (!Array.isArray(issue.input)) {
    return undefined;
  }
  return buildRepeatedFilterMessage(String(issue.path));
};

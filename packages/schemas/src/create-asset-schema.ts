import { z } from "zod";
import { GenreSchema } from "./genre-schema.ts";
import { isValidIsbn, normalizeIsbn, toCanonicalIsbn13 } from "./isbn.ts";
import {
  buildYearOutOfRangeMessage,
  MAX_TEXT_LENGTH,
  VALIDATION_MESSAGES,
} from "./validation-messages.ts";

export const buildCreateAssetSchema = ({ currentYear }: BuildCreateAssetSchemaOptions) => {
  const yearOutOfRangeMessage = buildYearOutOfRangeMessage({
    earliestYear: EARLIEST_PUBLISHED_YEAR,
    currentYear,
  });
  return z
    .object({
      title: z
        .string({ error: VALIDATION_MESSAGES.titleRequired })
        .trim()
        .min(1, { error: VALIDATION_MESSAGES.titleRequired })
        .max(MAX_TEXT_LENGTH, { error: VALIDATION_MESSAGES.titleTooLong }),
      author: z
        .string({ error: VALIDATION_MESSAGES.authorRequired })
        .trim()
        .min(1, { error: VALIDATION_MESSAGES.authorRequired })
        .max(MAX_TEXT_LENGTH, { error: VALIDATION_MESSAGES.authorTooLong }),
      isbn: z
        .string({ error: VALIDATION_MESSAGES.isbnRequired })
        .trim()
        .min(1, { error: VALIDATION_MESSAGES.isbnRequired })
        .transform(normalizeIsbn)
        .refine(isValidIsbn, { error: VALIDATION_MESSAGES.isbnInvalid })
        .transform(toCanonicalIsbn13),
      publishedYear: z
        .number({
          error: (issue) =>
            issue.input === undefined ? VALIDATION_MESSAGES.yearRequired : yearOutOfRangeMessage,
        })
        .int({ error: yearOutOfRangeMessage })
        .min(EARLIEST_PUBLISHED_YEAR, { error: yearOutOfRangeMessage })
        .max(currentYear, { error: yearOutOfRangeMessage }),
      genre: z.enum(GenreSchema.options, { error: VALIDATION_MESSAGES.genreInvalid }).optional(),
    })
    .strict();
};

export type CreateAssetInput = z.infer<ReturnType<typeof buildCreateAssetSchema>>;

type BuildCreateAssetSchemaOptions = { readonly currentYear: number };

const EARLIEST_PUBLISHED_YEAR = 1450;

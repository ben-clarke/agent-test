import { z } from "zod";

export const ValidationErrorResponseSchema = z.object({
  error: z.literal("ValidationError"),
  details: z.array(z.object({ field: z.string(), message: z.string() })),
});

export const DuplicateIsbnResponseSchema = z.object({
  error: z.literal("DuplicateIsbn"),
  details: z.array(z.object({ field: z.literal("isbn"), message: z.string() })),
});

export const InternalErrorResponseSchema = z.object({
  error: z.literal("InternalError"),
});

export type ValidationErrorResponse = z.infer<typeof ValidationErrorResponseSchema>;
export type DuplicateIsbnResponse = z.infer<typeof DuplicateIsbnResponseSchema>;
export type InternalErrorResponse = z.infer<typeof InternalErrorResponseSchema>;

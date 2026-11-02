import { z } from "zod";

export const GenreSchema = z.enum([
  "fiction",
  "non-fiction",
  "science-fiction",
  "fantasy",
  "mystery",
  "biography",
  "history",
  "children",
  "poetry",
  "other",
]);

export type Genre = z.infer<typeof GenreSchema>;

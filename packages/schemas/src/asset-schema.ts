import { z } from "zod";
import { GenreSchema } from "./genre-schema.ts";

export const AssetSchema = z.object({
  id: z.uuid(),
  title: z.string(),
  author: z.string(),
  isbn: z.string(),
  publishedYear: z.number().int(),
  genre: GenreSchema.nullable(),
  createdAt: z.iso.datetime(),
});

export type Asset = z.infer<typeof AssetSchema>;

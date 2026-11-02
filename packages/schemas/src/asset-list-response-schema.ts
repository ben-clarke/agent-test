import { z } from "zod";
import { AssetSchema } from "./asset-schema.ts";

export const AssetListResponseSchema = z.object({
  items: z.array(AssetSchema),
});

export type AssetListResponse = z.infer<typeof AssetListResponseSchema>;

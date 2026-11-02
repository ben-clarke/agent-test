import type { Asset, AssetFilter } from "@library/schemas";

export interface AssetRepository {
  insert: (options: { readonly asset: Asset }) => Promise<InsertAssetResult>;
  list: (options: { readonly filter: AssetFilter }) => Promise<readonly Asset[]>;
  close: () => Promise<void>;
}

export type InsertAssetResult =
  | { readonly outcome: "created"; readonly asset: Asset }
  | { readonly outcome: "duplicate-isbn" };

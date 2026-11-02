import { buildAssetQuery, type AssetFilterValues } from "./build-asset-query.ts";
import { toListResult, type ListResult } from "./to-client-result.ts";

export const listAssets = async ({ filters, signal }: ListAssetsOptions): Promise<ListResult> => {
  const url = new URL("/assets", window.location.origin);
  url.search = buildAssetQuery(filters).toString();

  try {
    const response = await fetch(url, { signal });
    return toListResult({ status: response.status, body: await response.json() });
  } catch {
    return { kind: "unavailable" };
  }
};

interface ListAssetsOptions {
  readonly filters: AssetFilterValues;
  readonly signal: AbortSignal;
}

import { useCallback, useEffect, useState } from "react";
import type { Asset } from "@library/schemas";
import type { AssetFilterValues } from "../api/build-asset-query.ts";
import { listAssets } from "../api/list-assets.ts";
import type { Details } from "../group-details-by-field.ts";
import type { ListResult } from "../api/to-client-result.ts";

export const useAssetList = ({ filters }: UseAssetListOptions): AssetListApi => {
  const [listState, setListState] = useState<AssetListState>(LOADING_STATE);
  const [isReloading, setIsReloading] = useState<boolean>(false);
  const [reloadCount, setReloadCount] = useState<number>(0);

  useEffect(() => {
    const controller = new AbortController();

    const load = async (): Promise<void> => {
      const result = await listAssets({ filters, signal: controller.signal });
      if (controller.signal.aborted) {
        return;
      }
      setListState((previous) => toListState({ result, previous }));
      setIsReloading(false);
    };

    void load();
    return () => controller.abort();
  }, [filters, reloadCount]);

  const reload = useCallback((): void => {
    setIsReloading(true);
    setReloadCount((count) => count + 1);
  }, []);

  return { listState, isReloading, reload };
};

const toListState = ({ result, previous }: ToListStateOptions): AssetListState => {
  if (result.kind === "listed") {
    return { status: "loaded", items: result.items };
  }
  if (result.kind === "rejected") {
    return { status: "rejected", items: keptItems(previous), details: result.details };
  }
  return UNAVAILABLE_STATE;
};

const keptItems = (previous: AssetListState): readonly Asset[] =>
  previous.status === "loaded" || previous.status === "rejected" ? previous.items : [];

const LOADING_STATE: AssetListState = { status: "loading" };
const UNAVAILABLE_STATE: AssetListState = { status: "unavailable" };

export type AssetListState =
  | { readonly status: "loading" }
  | { readonly status: "loaded"; readonly items: readonly Asset[] }
  | {
      readonly status: "rejected";
      readonly items: readonly Asset[];
      readonly details: Details;
    }
  | { readonly status: "unavailable" };

interface ToListStateOptions {
  readonly result: ListResult;
  readonly previous: AssetListState;
}

interface UseAssetListOptions {
  readonly filters: AssetFilterValues;
}

interface AssetListApi {
  readonly listState: AssetListState;
  readonly isReloading: boolean;
  readonly reload: () => void;
}

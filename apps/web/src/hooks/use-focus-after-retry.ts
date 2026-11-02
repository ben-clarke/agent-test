import { useCallback, useEffect, useRef } from "react";
import type { AssetFilterValues } from "../api/build-asset-query.ts";
import type { AssetListState } from "./use-asset-list.ts";

export const useFocusAfterRetry = ({
  listState,
  isReloading,
  reload,
  filters,
}: UseFocusAfterRetryOptions): FocusAfterRetryApi => {
  const headingRef = useRef<HTMLHeadingElement>(null);
  const isRetryingRef = useRef<boolean>(false);

  useEffect(() => {
    isRetryingRef.current = false;
  }, [filters]);

  useEffect(() => {
    if (!isRetryingRef.current || isReloading) {
      return;
    }
    isRetryingRef.current = false;
    if (listState.status === "loaded") {
      headingRef.current?.focus();
    }
  }, [listState, isReloading]);

  const retry = useCallback((): void => {
    isRetryingRef.current = true;
    reload();
  }, [reload]);

  return { headingRef, retry };
};

interface UseFocusAfterRetryOptions {
  readonly listState: AssetListState;
  readonly isReloading: boolean;
  readonly reload: () => void;
  readonly filters: AssetFilterValues;
}

interface FocusAfterRetryApi {
  readonly headingRef: React.RefObject<HTMLHeadingElement | null>;
  readonly retry: () => void;
}

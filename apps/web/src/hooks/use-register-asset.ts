import { useState } from "react";
import type { Asset } from "@library/schemas";
import { registerAsset, type CreateAssetRequest } from "../api/register-asset.ts";
import type { RegisterResult } from "../api/to-client-result.ts";

export const useRegisterAsset = ({ onRegistered }: UseRegisterAssetOptions): RegisterAssetApi => {
  const [registeredAsset, setRegisteredAsset] = useState<Asset | undefined>(undefined);

  const [isPending, setIsPending] = useState<boolean>(false);

  const register = async (request: CreateAssetRequest): Promise<RegisterResult> => {
    setIsPending(true);
    try {
      const result = await registerAsset(request);
      if (result.kind === "created") {
        setRegisteredAsset(result.asset);
        onRegistered();
      }
      return result;
    } finally {
      setIsPending(false);
    }
  };

  const clearRegistered = (): void => setRegisteredAsset(undefined);

  return { registeredAsset, isPending, register, clearRegistered };
};

interface UseRegisterAssetOptions {
  readonly onRegistered: () => void;
}

interface RegisterAssetApi {
  readonly registeredAsset: Asset | undefined;
  readonly isPending: boolean;
  readonly register: (request: CreateAssetRequest) => Promise<RegisterResult>;
  readonly clearRegistered: () => void;
}

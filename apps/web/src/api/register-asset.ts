import { toRegisterResult, type RegisterResult } from "./to-client-result.ts";

export const registerAsset = async (input: CreateAssetRequest): Promise<RegisterResult> => {
  try {
    const response = await fetch(new URL("/assets", window.location.origin), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });
    return toRegisterResult({ status: response.status, body: await response.json() });
  } catch {
    return { kind: "unavailable" };
  }
};

export interface CreateAssetRequest {
  readonly title: string;
  readonly author: string;
  readonly isbn: string;
  readonly publishedYear?: number | string;
  readonly genre?: string;
}

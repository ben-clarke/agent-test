import type { Asset } from "@library/schemas";
import { http, HttpResponse, type JsonBodyType } from "msw";
import type { Gate } from "./create-gate.ts";

export const listAssetsHandler = ({ items = [], gate }: ListAssetsHandlerOptions = {}) =>
  http.get("/assets", async () => {
    await gate?.wait;
    return HttpResponse.json({ items });
  });

export const registerAssetHandler = ({ asset, onRequest }: RegisterAssetHandlerOptions) =>
  http.post("/assets", async ({ request }) => {
    onRequest(await request.json());
    return HttpResponse.json(asset, { status: 201 });
  });

export const registerAssetRawHandler = ({
  status,
  body,
  onRequest,
}: RawHandlerOptions & { readonly onRequest?: (body: unknown) => void }) =>
  http.post("/assets", async ({ request }) => {
    onRequest?.(await request.json());
    return HttpResponse.json(body, { status });
  });

export const listAssetsRawHandler = ({ status, body }: RawHandlerOptions) =>
  http.get("/assets", () => HttpResponse.json(body, { status }));

interface ListAssetsHandlerOptions {
  readonly items?: readonly Asset[];
  readonly gate?: Gate;
}

interface RegisterAssetHandlerOptions {
  readonly asset: Asset;
  readonly onRequest: (body: unknown) => void;
}

interface RawHandlerOptions {
  readonly status: number;
  readonly body: JsonBodyType;
}

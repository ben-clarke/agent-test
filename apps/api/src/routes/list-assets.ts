import type { FastifyInstance } from "fastify";
import {
  AssetFilterSchema,
  buildUnrecognisedFilterMessage,
  type AssetListResponse,
} from "@library/schemas";
import type { AssetRepository } from "../assets/asset-repository.ts";
import { parseOrThrow } from "../http/parse-or-throw.ts";

export const registerListAssetsRoute = ({
  app,
  repository,
}: RegisterListAssetsRouteOptions): void => {
  app.get("/assets", async (request): Promise<AssetListResponse> => {
    const filter = parseOrThrow({
      schema: AssetFilterSchema,
      value: request.query,
      buildUnrecognisedMessage: buildUnrecognisedFilterMessage,
    });
    const items = await repository.list({ filter });
    return { items: [...items] };
  });
};

export type RegisterListAssetsRouteOptions = {
  readonly app: FastifyInstance;
  readonly repository: AssetRepository;
};

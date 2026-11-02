import type { FastifyInstance } from "fastify";
import {
  buildCreateAssetSchema,
  VALIDATION_MESSAGES,
  type Asset,
  type CreateAssetInput,
  type DuplicateIsbnResponse,
} from "@library/schemas";
import type { AssetRepository } from "../assets/asset-repository.ts";
import { parseOrThrow } from "../http/parse-or-throw.ts";

export const registerRegisterAssetRoute = ({
  app,
  repository,
  now,
  generateId,
}: RegisterRegisterAssetRouteOptions): void => {
  app.post("/assets", async (request, reply): Promise<unknown> => {
    const requestTime = now();
    const input = parseOrThrow({
      schema: buildCreateAssetSchema({ currentYear: requestTime.getUTCFullYear() }),
      value: request.body,
    });
    const result = await repository.insert({
      asset: toAsset({ input, id: generateId(), requestTime }),
    });
    if (result.outcome === "duplicate-isbn") {
      request.log.warn({ field: "isbn" }, "Duplicate ISBN rejected");
      return reply.status(HTTP_CONFLICT).send({
        error: "DuplicateIsbn",
        details: [{ field: "isbn", message: VALIDATION_MESSAGES.isbnDuplicate }],
      } satisfies DuplicateIsbnResponse);
    }
    const { asset } = result;
    request.log.info({ id: asset.id, isbn: asset.isbn }, "Asset registered");
    return reply.status(HTTP_CREATED).send(asset);
  });
};

const toAsset = ({
  input,
  id,
  requestTime,
}: {
  input: CreateAssetInput;
  id: string;
  requestTime: Date;
}): Asset => ({
  id,
  title: input.title,
  author: input.author,
  isbn: input.isbn,
  publishedYear: input.publishedYear,
  genre: input.genre ?? null,
  createdAt: requestTime.toISOString(),
});

export type RegisterRegisterAssetRouteOptions = {
  readonly app: FastifyInstance;
  readonly repository: AssetRepository;
  readonly now: () => Date;
  readonly generateId: () => string;
};

const HTTP_CREATED = 201;
const HTTP_CONFLICT = 409;

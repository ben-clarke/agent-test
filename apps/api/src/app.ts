import Fastify, { type FastifyBaseLogger, type FastifyInstance } from "fastify";
import type { AssetRepository } from "./assets/asset-repository.ts";
import { handleError } from "./http/error-handler.ts";
import { registerListAssetsRoute } from "./routes/list-assets.ts";
import { registerRegisterAssetRoute } from "./routes/register-asset.ts";

export const buildApp = ({
  repository,
  now,
  generateId,
  loggerInstance,
}: BuildAppOptions): FastifyInstance => {
  const app = Fastify({ loggerInstance });
  app.removeContentTypeParser(DEFAULT_TEXT_PARSER_TYPE);
  app.setErrorHandler(handleError);
  registerListAssetsRoute({ app, repository });
  registerRegisterAssetRoute({ app, repository, now, generateId });
  return app;
};

const DEFAULT_TEXT_PARSER_TYPE = "text/plain";

export type BuildAppOptions = {
  readonly repository: AssetRepository;
  readonly now: () => Date;
  readonly generateId: () => string;
  readonly loggerInstance: FastifyBaseLogger;
};

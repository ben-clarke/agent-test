import type { FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { RequestValidationError, type ValidationDetail } from "./request-validation-error.ts";
import { BODY_NOT_JSON_OBJECT_DETAIL } from "./validation-details.ts";

export const handleError = (
  error: FastifyError | RequestValidationError,
  request: FastifyRequest,
  reply: FastifyReply,
): FastifyReply => {
  if (error instanceof RequestValidationError) {
    return rejectValidation({ details: error.details, request, reply });
  }
  if (JSON_PARSE_ERROR_CODES.has(error.code)) {
    return rejectValidation({ details: [BODY_NOT_JSON_OBJECT_DETAIL], request, reply });
  }
  if (error.code === MEDIA_TYPE_ERROR_CODE) {
    request.log.warn({ code: error.code }, "Request rejected");
    return reply.status(HTTP_UNSUPPORTED_MEDIA_TYPE).send({ error: "UnsupportedMediaType" });
  }
  if (isClientError(error)) {
    request.log.warn({ code: error.code, statusCode: error.statusCode }, "Request rejected");
    return reply.status(error.statusCode).send({ error: "RequestRejected" });
  }
  request.log.error({ err: error }, "Request failed");
  return reply.status(HTTP_INTERNAL_SERVER_ERROR).send({ error: "InternalError" });
};

const rejectValidation = ({
  details,
  request,
  reply,
}: {
  readonly details: readonly ValidationDetail[];
  readonly request: FastifyRequest;
  readonly reply: FastifyReply;
}): FastifyReply => {
  request.log.warn({ fields: details.map((detail) => detail.field) }, "Request rejected");
  return reply.status(HTTP_BAD_REQUEST).send({ error: "ValidationError", details });
};

const isClientError = (
  error: FastifyError,
): error is FastifyError & { readonly statusCode: number } =>
  error.statusCode !== undefined &&
  error.statusCode >= HTTP_CLIENT_ERROR_MIN &&
  error.statusCode <= HTTP_CLIENT_ERROR_MAX;

const HTTP_BAD_REQUEST = 400;
const HTTP_UNSUPPORTED_MEDIA_TYPE = 415;
const HTTP_INTERNAL_SERVER_ERROR = 500;
const HTTP_CLIENT_ERROR_MIN = HTTP_BAD_REQUEST;
const HTTP_CLIENT_ERROR_MAX = 499;
const MEDIA_TYPE_ERROR_CODE = "FST_ERR_CTP_INVALID_MEDIA_TYPE";
const JSON_PARSE_ERROR_CODES: ReadonlySet<string> = new Set([
  "FST_ERR_CTP_INVALID_JSON_BODY",
  "FST_ERR_CTP_EMPTY_JSON_BODY",
]);

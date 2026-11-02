import {
  AssetListResponseSchema,
  AssetSchema,
  DuplicateIsbnResponseSchema,
  ValidationErrorResponseSchema,
  type Asset,
  type ValidationErrorResponse,
} from "@library/schemas";

export const toListResult = ({ status, body }: ApiResponse): ListResult => {
  if (status === HTTP_BAD_REQUEST) {
    return toRejectedResult(ValidationErrorResponseSchema, body);
  }

  const parsed = AssetListResponseSchema.safeParse(body);

  return status === HTTP_OK && parsed.success
    ? { kind: "listed", items: parsed.data.items }
    : UNAVAILABLE_RESULT;
};

export const toRegisterResult = ({ status, body }: ApiResponse): RegisterResult => {
  const rejectionSchema = REJECTION_SCHEMAS_BY_STATUS[status];
  if (rejectionSchema !== undefined) {
    return toRejectedResult(rejectionSchema, body);
  }

  const parsed = AssetSchema.safeParse(body);

  return status === HTTP_CREATED && parsed.success
    ? { kind: "created", asset: parsed.data }
    : UNAVAILABLE_RESULT;
};

const toRejectedResult = (
  schema: RejectionSchema,
  body: unknown,
): RejectedResult | UnavailableResult => {
  const rejection = schema.safeParse(body);
  return rejection.success
    ? { kind: "rejected", details: rejection.data.details }
    : UNAVAILABLE_RESULT;
};

const HTTP_OK = 200;
const HTTP_CREATED = 201;
const HTTP_BAD_REQUEST = 400;
const HTTP_CONFLICT = 409;

const UNAVAILABLE_RESULT: UnavailableResult = { kind: "unavailable" };

const REJECTION_SCHEMAS_BY_STATUS: Readonly<Record<number, RejectionSchema>> = {
  [HTTP_BAD_REQUEST]: ValidationErrorResponseSchema,
  [HTTP_CONFLICT]: DuplicateIsbnResponseSchema,
};

export type ListResult =
  | { readonly kind: "listed"; readonly items: readonly Asset[] }
  | RejectedResult
  | UnavailableResult;

export type RegisterResult =
  | { readonly kind: "created"; readonly asset: Asset }
  | RejectedResult
  | UnavailableResult;

type RejectionSchema = typeof ValidationErrorResponseSchema | typeof DuplicateIsbnResponseSchema;

interface RejectedResult {
  readonly kind: "rejected";
  readonly details: ValidationErrorResponse["details"];
}

interface UnavailableResult {
  readonly kind: "unavailable";
}

interface ApiResponse {
  readonly status: number;
  readonly body: unknown;
}

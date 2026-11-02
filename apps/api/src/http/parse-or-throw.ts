import type { z } from "zod";
import { RequestValidationError } from "./request-validation-error.ts";
import { toValidationDetails } from "./validation-details.ts";

export const parseOrThrow = <Schema extends z.ZodType>({
  schema,
  value,
  buildUnrecognisedMessage,
}: ParseOrThrowOptions<Schema>): z.output<Schema> => {
  const result = schema.safeParse(value);
  if (result.success) {
    return result.data;
  }
  throw new RequestValidationError({
    details: toValidationDetails({ issues: result.error.issues, buildUnrecognisedMessage }),
  });
};

export type ParseOrThrowOptions<Schema extends z.ZodType> = {
  readonly schema: Schema;
  readonly value: unknown;
  readonly buildUnrecognisedMessage?: (key: string) => string;
};

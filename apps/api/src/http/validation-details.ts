import { buildUnrecognisedFieldMessage, VALIDATION_MESSAGES } from "@library/schemas";
import type { z } from "zod";
import type { ValidationDetail } from "./request-validation-error.ts";

export const toValidationDetails = ({
  issues,
  buildUnrecognisedMessage = buildUnrecognisedFieldMessage,
}: ToValidationDetailsOptions): readonly ValidationDetail[] =>
  issues.flatMap((issue) => toIssueDetails({ issue, buildUnrecognisedMessage }));

const toIssueDetails = ({
  issue,
  buildUnrecognisedMessage,
}: {
  readonly issue: z.core.$ZodIssue;
  readonly buildUnrecognisedMessage: (key: string) => string;
}): readonly ValidationDetail[] => {
  if (issue.code === "unrecognized_keys") {
    return issue.keys.map((key) => ({
      field: [...issue.path, key].join("."),
      message: buildUnrecognisedMessage(key),
    }));
  }
  if (issue.path.length === 0) {
    return [BODY_NOT_JSON_OBJECT_DETAIL];
  }
  return [{ field: issue.path.join("."), message: issue.message }];
};

export const BODY_FIELD = "body";
export const BODY_NOT_JSON_OBJECT_DETAIL: ValidationDetail = {
  field: BODY_FIELD,
  message: VALIDATION_MESSAGES.bodyNotJsonObject,
};

export type ToValidationDetailsOptions = {
  readonly issues: readonly z.core.$ZodIssue[];
  readonly buildUnrecognisedMessage?: (key: string) => string;
};

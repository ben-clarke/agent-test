import type { ValidationErrorResponse } from "@library/schemas";

export const groupDetailsByField = ({
  details,
  fieldNames,
}: GroupDetailsOptions): GroupedDetails => {
  const fieldErrors: FieldErrors = Object.fromEntries(
    fieldNames.flatMap((name) => {
      const detail = details.find((candidate) => candidate.field === name);
      return detail === undefined ? [] : [[name, detail.message]];
    }),
  );
  const otherDetails = details.filter(
    (detail) => !fieldNames.some((name) => name === detail.field),
  );

  return { fieldErrors, otherDetails };
};

export type FieldErrors = Readonly<Partial<Record<string, string>>>;
export type Details = ValidationErrorResponse["details"];

export interface GroupedDetails {
  readonly fieldErrors: FieldErrors;
  readonly otherDetails: Details;
}

interface GroupDetailsOptions {
  readonly details: Details;
  readonly fieldNames: readonly string[];
}

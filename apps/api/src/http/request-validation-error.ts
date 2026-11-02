export class RequestValidationError extends Error {
  readonly details: readonly ValidationDetail[];

  constructor({ details }: { readonly details: readonly ValidationDetail[] }) {
    super("Request validation failed");
    this.name = "RequestValidationError";
    this.details = details;
  }
}

export type ValidationDetail = {
  readonly field: string;
  readonly message: string;
};

import { useState } from "react";
import type { Asset } from "@library/schemas";
import { Button } from "../form-controls/button.tsx";
import { GenreSelect } from "../form-controls/genre-select.tsx";
import { TextField } from "../form-controls/text-field.tsx";
import {
  groupDetailsByField,
  type FieldErrors,
  type GroupedDetails,
} from "../../group-details-by-field.ts";
import { useRegisterAsset } from "../../hooks/use-register-asset.ts";
import { FormAlert } from "./form-alert.tsx";
import { RegistrationSuccess } from "./registration-success.tsx";
import { toCreateAssetRequest, type BookFormValues } from "./to-create-asset-request.ts";

export const RegisterBookForm = ({
  onRegistered,
  isReloading,
  listedBooks,
}: RegisterBookFormProps): React.JSX.Element => {
  const [values, setValues] = useState<BookFormValues>(EMPTY_VALUES);
  const { registeredAsset, isPending, register, clearRegistered } = useRegisterAsset({
    onRegistered,
  });

  const [grouped, setGrouped] = useState<GroupedDetails>(NO_DETAILS);
  const [isUnavailable, setIsUnavailable] = useState<boolean>(false);

  const changeValue = (name: keyof BookFormValues, value: string): void => {
    clearRegistered();
    setGrouped((current) => ({
      ...current,
      fieldErrors: Object.fromEntries(
        Object.entries(current.fieldErrors).filter(([field]) => field !== name),
      ),
    }));
    setValues((current) => ({ ...current, [name]: value }));
  };

  const submit = async (event: React.SyntheticEvent<HTMLFormElement>): Promise<void> => {
    event.preventDefault();
    if (isPending) {
      return;
    }
    const form = event.currentTarget;
    clearRegistered();
    setGrouped(NO_DETAILS);
    setIsUnavailable(false);
    const submittedValues = values;
    const result = await register(toCreateAssetRequest(submittedValues));
    setIsUnavailable(result.kind === "unavailable");
    if (result.kind === "created") {
      setValues((current) => clearSubmittedFields({ current, submitted: submittedValues }));
    }
    if (result.kind === "rejected") {
      const rejection = groupDetailsByField({
        details: result.details,
        fieldNames: FORM_FIELD_NAMES,
      });
      setGrouped(rejection);
      focusFirstInvalidField({ form, fieldErrors: rejection.fieldErrors });
    }
  };

  const { fieldErrors, otherDetails } = grouped;

  return (
    <form noValidate onSubmit={submit} className="flex flex-col gap-4">
      <FormAlert
        messages={[
          ...(isUnavailable ? [UNAVAILABLE_MESSAGE] : []),
          ...otherDetails.map((detail) => detail.message),
        ]}
      />
      {TEXT_FIELDS.map((field) => (
        <TextField
          key={field.name}
          {...field}
          value={values[field.name]}
          error={fieldErrors[field.name]}
          onChange={(value) => changeValue(field.name, value)}
        />
      ))}
      <GenreSelect
        value={values.genre}
        error={fieldErrors.genre}
        onChange={(value) => changeValue("genre", value)}
      />
      <Button variant="primary" type="submit" ariaDisabled={isPending} className="self-start">
        {isPending ? "Registering…" : "Register book"}
      </Button>
      <RegistrationSuccess
        asset={registeredAsset}
        isReloading={isReloading}
        listedBooks={listedBooks}
      />
    </form>
  );
};

// Keeps text staff typed while the registration was in flight.
const clearSubmittedFields = ({ current, submitted }: ClearSubmittedOptions): BookFormValues => ({
  title: clearUnlessEdited(current.title, submitted.title),
  author: clearUnlessEdited(current.author, submitted.author),
  isbn: clearUnlessEdited(current.isbn, submitted.isbn),
  publishedYear: clearUnlessEdited(current.publishedYear, submitted.publishedYear),
  genre: clearUnlessEdited(current.genre, submitted.genre),
});

const clearUnlessEdited = (current: string, submitted: string): string =>
  current === submitted ? "" : current;

const focusFirstInvalidField = ({ form, fieldErrors }: FocusOptions): void => {
  const firstInvalid = FORM_FIELD_NAMES.find((name) => fieldErrors[name] !== undefined);
  const control = firstInvalid === undefined ? null : form.elements.namedItem(firstInvalid);
  if (control instanceof HTMLElement) {
    control.focus();
  }
};

const UNAVAILABLE_MESSAGE =
  "Could not register the book. Check the service is running and try again.";

const NO_DETAILS: GroupedDetails = { fieldErrors: {}, otherDetails: [] };

const EMPTY_VALUES: BookFormValues = {
  title: "",
  author: "",
  isbn: "",
  publishedYear: "",
  genre: "",
};

const TEXT_FIELDS: readonly TextFieldConfig[] = [
  { name: "title", label: "Title" },
  { name: "author", label: "Author" },
  { name: "isbn", label: "ISBN" },
  { name: "publishedYear", label: "Year", inputMode: "numeric" },
];

const FORM_FIELD_NAMES: readonly string[] = [...TEXT_FIELDS.map(({ name }) => name), "genre"];

interface RegisterBookFormProps {
  readonly onRegistered: () => void;
  readonly isReloading: boolean;
  readonly listedBooks?: readonly Asset[];
}

interface TextFieldConfig {
  readonly name: Exclude<keyof BookFormValues, "genre">;
  readonly label: string;
  readonly inputMode?: "numeric";
}

interface ClearSubmittedOptions {
  readonly current: BookFormValues;
  readonly submitted: BookFormValues;
}

interface FocusOptions {
  readonly form: HTMLFormElement;
  readonly fieldErrors: FieldErrors;
}

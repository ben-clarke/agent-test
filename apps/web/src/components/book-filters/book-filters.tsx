import { useEffect, useRef, useState } from "react";
import { NO_FILTERS, type AssetFilterValues } from "../../api/build-asset-query.ts";
import { Button } from "../form-controls/button.tsx";
import { GenreSelect } from "../form-controls/genre-select.tsx";
import {
  groupDetailsByField,
  type Details,
  type FieldErrors,
} from "../../group-details-by-field.ts";
import { TextField } from "../form-controls/text-field.tsx";

export const BookFilters = ({ onApply, rejection }: BookFiltersProps): React.JSX.Element => {
  const [values, setValues] = useState<AssetFilterValues>(NO_FILTERS);
  const [dismissal, setDismissal] = useState<Dismissal>({ rejection, fieldNames: [] });
  const formRef = useRef<HTMLFormElement>(null);

  const fieldErrors = toVisibleErrors({ rejection, dismissal });

  useEffect(() => {
    focusFirstInvalidFilter({ form: formRef.current, rejection });
  }, [rejection]);

  const changeValue = (name: keyof AssetFilterValues, value: string): void => {
    setDismissal(addDismissed({ dismissal, rejection, fieldNames: [name] }));
    setValues((current) => ({ ...current, [name]: value }));
  };

  const apply = (event: React.SyntheticEvent<HTMLFormElement>): void => {
    event.preventDefault();
    setDismissal(addDismissed({ dismissal, rejection, fieldNames: FILTER_FIELD_NAMES }));
    onApply({ ...values });
  };

  const clear = (): void => {
    setDismissal(addDismissed({ dismissal, rejection, fieldNames: FILTER_FIELD_NAMES }));
    setValues(NO_FILTERS);
    onApply({ ...NO_FILTERS });
  };

  return (
    <form ref={formRef} noValidate onSubmit={apply} className="flex flex-col gap-4">
      {FILTER_FIELDS.map((field) => (
        <TextField
          key={field.name}
          {...field}
          idPrefix={ID_PREFIX}
          isRequired={false}
          value={values[field.name]}
          error={fieldErrors[field.name]}
          onChange={(value) => changeValue(field.name, value)}
        />
      ))}
      <GenreSelect
        idPrefix={ID_PREFIX}
        label="Genre"
        emptyLabel="All genres"
        value={values.genre}
        error={fieldErrors.genre}
        onChange={(value) => changeValue("genre", value)}
      />
      <div className="flex gap-2">
        <Button variant="primary" type="submit">
          Apply filters
        </Button>
        <Button variant="secondary" type="button" onClick={clear}>
          Clear filters
        </Button>
      </div>
    </form>
  );
};

const toFilterDetails = (details: Details): Details =>
  details.map((detail) => (detail.field === "q" ? { ...detail, field: "title" } : detail));

const toFilterErrors = (rejection: Details): FieldErrors =>
  groupDetailsByField({
    details: toFilterDetails(rejection),
    fieldNames: FILTER_FIELD_NAMES,
  }).fieldErrors;

const toVisibleErrors = ({ rejection, dismissal }: VisibleErrorsOptions): FieldErrors => {
  if (rejection === undefined) {
    return {};
  }
  const fieldErrors = toFilterErrors(rejection);
  const dismissed = dismissal.rejection === rejection ? dismissal.fieldNames : [];
  return Object.fromEntries(
    Object.entries(fieldErrors).filter(([name]) => !dismissed.some((field) => field === name)),
  );
};

const addDismissed = ({ dismissal, rejection, fieldNames }: AddDismissedOptions): Dismissal => ({
  rejection,
  fieldNames: [...(dismissal.rejection === rejection ? dismissal.fieldNames : []), ...fieldNames],
});

const focusFirstInvalidFilter = ({ form, rejection }: FocusOptions): void => {
  if (form === null || rejection === undefined) {
    return;
  }
  const fieldErrors = toFilterErrors(rejection);
  const [control] = FILTER_FIELD_NAMES.filter((name) => fieldErrors[name] !== undefined).map(
    (name) => form.elements.namedItem(name),
  );
  if (control instanceof HTMLElement) {
    control.focus();
  }
};

const ID_PREFIX = "filter-books";

const FILTER_FIELDS: readonly FilterFieldConfig[] = [
  { name: "author", label: "Author" },
  { name: "title", label: "Title contains" },
  { name: "publishedYear", label: "Year", inputMode: "numeric" },
];

const FILTER_FIELD_NAMES: readonly string[] = [...FILTER_FIELDS.map(({ name }) => name), "genre"];

interface BookFiltersProps {
  readonly onApply: (filters: AssetFilterValues) => void;
  readonly rejection?: Details;
}

interface Dismissal {
  readonly rejection: Details | undefined;
  readonly fieldNames: readonly string[];
}

interface VisibleErrorsOptions {
  readonly rejection: Details | undefined;
  readonly dismissal: Dismissal;
}

interface AddDismissedOptions extends VisibleErrorsOptions {
  readonly fieldNames: readonly string[];
}

interface FocusOptions {
  readonly form: HTMLFormElement | null;
  readonly rejection: Details | undefined;
}

interface FilterFieldConfig {
  readonly name: Exclude<keyof AssetFilterValues, "genre">;
  readonly label: string;
  readonly inputMode?: "numeric";
}

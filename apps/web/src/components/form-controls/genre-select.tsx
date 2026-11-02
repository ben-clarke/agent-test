import { GenreSchema } from "@library/schemas";
import { FieldError } from "./field-error.tsx";
import { GENRE_LABELS, NO_GENRE_LABEL } from "../../genre-labels.ts";

export const GenreSelect = ({
  value,
  onChange,
  error,
  idPrefix = "register-book",
  label = "Genre (optional)",
  emptyLabel = NO_GENRE_LABEL,
}: GenreSelectProps): React.JSX.Element => (
  <div className="flex flex-col gap-1">
    <label htmlFor={`${idPrefix}-genre`} className="font-medium">
      {label}
    </label>
    <select
      id={`${idPrefix}-genre`}
      name="genre"
      aria-invalid={error === undefined ? undefined : true}
      aria-describedby={error === undefined ? undefined : `${idPrefix}-genre-error`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded border border-slate-500 p-2 focus-visible:outline-2 focus-visible:outline-blue-600"
    >
      <option value="">{emptyLabel}</option>
      {GenreSchema.options.map((genre) => (
        <option key={genre} value={genre}>
          {GENRE_LABELS[genre]}
        </option>
      ))}
    </select>
    <FieldError id={`${idPrefix}-genre-error`} message={error} />
  </div>
);

interface GenreSelectProps {
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly error?: string;
  readonly idPrefix?: string;
  readonly label?: string;
  readonly emptyLabel?: string;
}

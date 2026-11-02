import { FieldError } from "./field-error.tsx";

export const TextField = ({
  name,
  label,
  value,
  onChange,
  inputMode,
  error,
  idPrefix = "register-book",
  isRequired = true,
}: TextFieldProps): React.JSX.Element => (
  <div className="flex flex-col gap-1">
    <label htmlFor={`${idPrefix}-${name}`} className="font-medium">
      {label}
    </label>
    <input
      id={`${idPrefix}-${name}`}
      name={name}
      type="text"
      required={isRequired}
      inputMode={inputMode}
      aria-invalid={error === undefined ? undefined : true}
      aria-describedby={error === undefined ? undefined : `${idPrefix}-${name}-error`}
      value={value}
      onChange={(event) => onChange(event.target.value)}
      className="rounded border border-slate-500 p-2 focus-visible:outline-2 focus-visible:outline-blue-600"
    />
    <FieldError id={`${idPrefix}-${name}-error`} message={error} />
  </div>
);

interface TextFieldProps {
  readonly name: string;
  readonly label: string;
  readonly value: string;
  readonly onChange: (value: string) => void;
  readonly inputMode?: "numeric";
  readonly error?: string;
  readonly idPrefix?: string;
  readonly isRequired?: boolean;
}

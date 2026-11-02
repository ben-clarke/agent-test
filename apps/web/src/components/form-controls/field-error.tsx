export const FieldError = ({ id, message }: FieldErrorProps): React.JSX.Element | null =>
  message === undefined ? null : (
    <p id={id} className="text-red-700">
      {message}
    </p>
  );

interface FieldErrorProps {
  readonly id: string;
  readonly message?: string;
}

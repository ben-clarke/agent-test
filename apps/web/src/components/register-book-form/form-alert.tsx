export const FormAlert = ({ messages }: FormAlertProps): React.JSX.Element => (
  <div role="alert" className="text-red-700">
    {messages.map((message) => (
      <p key={message}>{message}</p>
    ))}
  </div>
);

interface FormAlertProps {
  readonly messages: readonly string[];
}

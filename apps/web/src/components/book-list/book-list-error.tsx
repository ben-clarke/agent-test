import { Button } from "../form-controls/button.tsx";

export const BookListError = ({ onRetry }: BookListErrorProps): React.JSX.Element => (
  <div role="alert" className="flex flex-col items-start gap-2 text-red-700">
    <p>{LIST_UNAVAILABLE_MESSAGE}</p>
    <Button variant="secondary" type="button" onClick={onRetry}>
      Retry
    </Button>
  </div>
);

const LIST_UNAVAILABLE_MESSAGE =
  "Could not load books. Check the service is running and try again.";

interface BookListErrorProps {
  readonly onRetry: () => void;
}

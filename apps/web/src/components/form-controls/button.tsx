export const Button = ({
  variant,
  type,
  onClick,
  ariaDisabled,
  className = "",
  children,
}: ButtonProps): React.JSX.Element => (
  <button
    type={type}
    onClick={onClick}
    aria-disabled={ariaDisabled}
    className={`${BASE_CLASSES} ${VARIANT_CLASSES[variant]} ${className}`.trim()}
  >
    {children}
  </button>
);

const BASE_CLASSES =
  "rounded px-4 py-2 font-medium focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600";

const VARIANT_CLASSES: Readonly<Record<ButtonVariant, string>> = {
  primary: "bg-blue-700 text-white",
  secondary: "border border-slate-500 text-slate-900",
};

type ButtonVariant = "primary" | "secondary";

interface ButtonProps {
  readonly variant: ButtonVariant;
  readonly type: "button" | "submit";
  readonly onClick?: () => void;
  readonly ariaDisabled?: boolean;
  readonly className?: string;
  readonly children: React.ReactNode;
}

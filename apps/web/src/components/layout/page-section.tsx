export const PageSection = ({
  id,
  title,
  headingRef,
  children,
}: PageSectionProps): React.JSX.Element => (
  <section aria-labelledby={id} className="flex flex-col gap-4">
    <h2
      id={id}
      ref={headingRef}
      tabIndex={headingRef === undefined ? undefined : -1}
      className="text-xl font-semibold focus-visible:outline-2 focus-visible:outline-blue-600"
    >
      {title}
    </h2>
    {children}
  </section>
);

interface PageSectionProps {
  readonly id: string;
  readonly title: string;
  readonly headingRef?: React.RefObject<HTMLHeadingElement | null>;
  readonly children?: React.ReactNode;
}

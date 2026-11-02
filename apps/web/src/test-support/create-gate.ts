export const createGate = (): Gate => {
  const { promise, resolve } = Promise.withResolvers<void>();
  return { wait: promise, open: resolve };
};

export interface Gate {
  readonly wait: Promise<void>;
  readonly open: () => void;
}

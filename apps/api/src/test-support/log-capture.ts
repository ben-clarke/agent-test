import { pino, type Logger } from "pino";

export const createLogCapture = (): LogCapture => {
  const lines: string[] = [];
  const loggerInstance = pino({ level: "info" }, { write: (line: string) => lines.push(line) });
  const readEntries = (): readonly unknown[] => lines.map((line): unknown => JSON.parse(line));
  return {
    loggerInstance,
    readEntriesAtLevel: (level) =>
      readEntries().filter((entry) => hasLevel({ entry, level: LOG_LEVELS[level] })),
  };
};

const hasLevel = ({ entry, level }: { entry: unknown; level: number }): boolean =>
  typeof entry === "object" && entry !== null && "level" in entry && entry.level === level;

export type LogCapture = {
  readonly loggerInstance: Logger;
  readonly readEntriesAtLevel: (level: LogLevelName) => readonly unknown[];
};

type LogLevelName = "info" | "warn" | "error";

const LOG_LEVELS: Readonly<Record<LogLevelName, number>> = { info: 30, warn: 40, error: 50 };

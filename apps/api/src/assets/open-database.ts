import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { DatabaseSync } from "node:sqlite";

export const openDatabase = ({ databasePath }: OpenDatabaseOptions): DatabaseSync => {
  if (databasePath !== IN_MEMORY_DATABASE) {
    mkdirSync(dirname(databasePath), { recursive: true });
  }
  const database = new DatabaseSync(databasePath);
  database.exec(CREATE_ASSETS_TABLE);
  database.exec(CREATE_ISBN_UNIQUE_INDEX);
  return database;
};

export type OpenDatabaseOptions = {
  readonly databasePath: string;
};

const IN_MEMORY_DATABASE = ":memory:";

const CREATE_ASSETS_TABLE = `
  CREATE TABLE IF NOT EXISTS assets (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    author TEXT NOT NULL,
    isbn TEXT NOT NULL,
    published_year INTEGER NOT NULL,
    genre TEXT,
    created_at TEXT NOT NULL,
    title_search TEXT NOT NULL,
    author_search TEXT NOT NULL
  )`;

const CREATE_ISBN_UNIQUE_INDEX = `
  CREATE UNIQUE INDEX IF NOT EXISTS assets_isbn_unique ON assets (isbn)`;

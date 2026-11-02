import type { DatabaseSync, SQLOutputValue } from "node:sqlite";
import { AssetSchema, type Asset, type AssetFilter } from "@library/schemas";
import type { AssetRepository, InsertAssetResult } from "./asset-repository.ts";

export const createSqliteAssetRepository = ({
  database,
}: CreateSqliteAssetRepositoryOptions): AssetRepository => ({
  insert: async ({ asset }): Promise<InsertAssetResult> => {
    try {
      database
        .prepare(INSERT_ASSET)
        .run(
          asset.id,
          asset.title,
          asset.author,
          asset.isbn,
          asset.publishedYear,
          asset.genre,
          asset.createdAt,
          asset.title.toLowerCase(),
          asset.author.toLowerCase(),
        );
    } catch (error) {
      if (isUniqueConstraintError(error)) {
        return { outcome: "duplicate-isbn" };
      }
      throw error;
    }
    return { outcome: "created", asset };
  },
  list: async ({ filter }): Promise<readonly Asset[]> => {
    const conditions = buildConditions(filter).filter(hasValue);
    const whereClause = conditions.length
      ? `WHERE ${conditions.map(({ clause }) => clause).join(" AND ")}`
      : "";
    return database
      .prepare(`${SELECT_ASSETS} ${whereClause} ${ORDER_ASSETS}`)
      .all(...conditions.map(({ value }) => value))
      .map(mapRowToAsset);
  },
  close: async (): Promise<void> => {
    database.close();
  },
});

const isUniqueConstraintError = (error: unknown): boolean =>
  error instanceof Error &&
  "code" in error &&
  error.code === SQLITE_ERROR_CODE &&
  "errcode" in error &&
  error.errcode === SQLITE_CONSTRAINT_UNIQUE;

const buildConditions = (filter: AssetFilter): readonly FilterCondition[] => [
  { clause: "author_search = ?", value: filter.author?.toLowerCase() },
  { clause: "instr(title_search, ?) > 0", value: filter.q?.toLowerCase() },
  { clause: "published_year = ?", value: filter.publishedYear },
  { clause: "genre = ?", value: filter.genre },
];

const hasValue = (condition: FilterCondition): condition is AppliedFilterCondition =>
  condition.value !== undefined;

const mapRowToAsset = (row: Record<string, SQLOutputValue>): Asset =>
  AssetSchema.parse({
    id: row.id,
    title: row.title,
    author: row.author,
    isbn: row.isbn,
    publishedYear: row.published_year,
    genre: row.genre,
    createdAt: row.created_at,
  });

export type CreateSqliteAssetRepositoryOptions = {
  readonly database: DatabaseSync;
};

type FilterCondition = {
  readonly clause: string;
  readonly value: string | number | undefined;
};

type AppliedFilterCondition = FilterCondition & { readonly value: string | number };

const SELECT_ASSETS = `
  SELECT id, title, author, isbn, published_year, genre, created_at
  FROM assets`;

const ORDER_ASSETS = "ORDER BY created_at DESC, rowid DESC";

const INSERT_ASSET = `
  INSERT INTO assets (
    id, title, author, isbn, published_year, genre, created_at, title_search, author_search
  ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`;

const SQLITE_ERROR_CODE = "ERR_SQLITE_ERROR";
const SQLITE_CONSTRAINT_UNIQUE = 2067;

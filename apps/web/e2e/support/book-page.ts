import type { Locator, Page } from "@playwright/test";
import type { UniqueBook } from "./build-unique-book.ts";

export const createBookPage = (page: Page): BookPage => {
  const registerRegion = page.getByRole("region", { name: "Register a book" });
  const findRegion = page.getByRole("region", { name: "Find books" });
  return {
    registerRegion,
    findRegion,
    registrationControls: [
      registerRegion.getByLabel("Title"),
      registerRegion.getByLabel("Author"),
      registerRegion.getByLabel("ISBN"),
      registerRegion.getByLabel("Year"),
      registerRegion.getByLabel("Genre (optional)"),
      registerRegion.getByRole("button", { name: "Register book" }),
    ],
    filterControls: [
      findRegion.getByLabel("Author"),
      findRegion.getByLabel("Title contains"),
      findRegion.getByLabel("Year"),
      findRegion.getByLabel("Genre"),
      findRegion.getByRole("button", { name: "Apply filters" }),
      findRegion.getByRole("button", { name: "Clear filters" }),
    ],
    open: async () => {
      await page.goto("/");
    },
    register: async ({ book, isbn = book.isbn13 }) => {
      await registerRegion.getByLabel("Title").fill(book.title);
      await registerRegion.getByLabel("Author").fill(book.author);
      await registerRegion.getByLabel("ISBN").fill(isbn);
      await registerRegion.getByLabel("Year").fill(String(book.publishedYear));
      await registerRegion.getByRole("button", { name: "Register book" }).click();
    },
    filterByAuthor: async ({ author }) => {
      await findRegion.getByLabel("Author").fill(author);
      await findRegion.getByRole("button", { name: "Apply filters" }).click();
    },
  };
};

export interface BookPage {
  readonly registerRegion: Locator;
  readonly findRegion: Locator;
  readonly registrationControls: readonly Locator[];
  readonly filterControls: readonly Locator[];
  readonly open: () => Promise<void>;
  readonly register: (options: RegisterOptions) => Promise<void>;
  readonly filterByAuthor: (options: { readonly author: string }) => Promise<void>;
}

interface RegisterOptions {
  readonly book: UniqueBook;
  readonly isbn?: string;
}

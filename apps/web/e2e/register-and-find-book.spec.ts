import { expect, test } from "@playwright/test";
import { buildUniqueBook } from "./support/build-unique-book.ts";
import { createBookPage } from "./support/book-page.ts";
import {
  hasFocusIndicatorChange,
  recordFocusStyle,
  type FocusStyle,
} from "./support/record-focus-styles.ts";

const DUPLICATE_ISBN_MESSAGE = "A book with this ISBN is already registered — find it in the list";
const NARROW_VIEWPORT = { width: 360, height: 800 };

test("staff register a book and find it by author", async ({ page }) => {
  const book = buildUniqueBook();
  const bookPage = createBookPage(page);
  await bookPage.open();

  await bookPage.register({ book });
  await expect(bookPage.registerRegion.getByText(`"${book.title}" registered.`)).toBeVisible();
  await bookPage.filterByAuthor({ author: book.author.toLowerCase() });

  await expect(bookPage.findRegion.getByText("1 book shown")).toBeAttached();
  await expect(
    bookPage.findRegion.getByRole("row", { name: new RegExp(book.title) }),
  ).toBeVisible();
});

test("registering a duplicate ISBN shows an error beside ISBN", async ({ page }) => {
  const book = buildUniqueBook();
  const bookPage = createBookPage(page);
  await bookPage.open();
  await bookPage.register({ book });
  await expect(bookPage.registerRegion.getByText(`"${book.title}" registered.`)).toBeVisible();

  await bookPage.register({ book, isbn: book.hyphenatedIsbn10 });

  await expect(bookPage.registerRegion.getByLabel("ISBN")).toHaveAccessibleDescription(
    DUPLICATE_ISBN_MESSAGE,
  );
  await bookPage.filterByAuthor({ author: book.author });
  await expect(bookPage.findRegion.getByText("1 book shown")).toBeAttached();
});

test("staff register a book using only the keyboard with visible focus", async ({ page }) => {
  const book = buildUniqueBook();
  const bookPage = createBookPage(page);
  await bookPage.open();
  const controls = [...bookPage.registrationControls, ...bookPage.filterControls];
  const unfocusedStyles = await Promise.all(controls.map(recordFocusStyle));

  const focusedStyles: FocusStyle[] = [];
  for (const control of controls) {
    await page.keyboard.press("Tab");
    await expect(control).toBeFocused();
    focusedStyles.push(await recordFocusStyle(control));
  }

  const changesOnFocus = focusedStyles.map((focused, index) =>
    hasFocusIndicatorChange({ unfocused: unfocusedStyles[index], focused }),
  );
  expect(changesOnFocus).toEqual(controls.map(() => true));

  await bookPage.registrationControls[0].focus();
  await page.keyboard.type(book.title);
  await page.keyboard.press("Tab");
  await page.keyboard.type(book.author);
  await page.keyboard.press("Tab");
  await page.keyboard.type(book.isbn13);
  await page.keyboard.press("Tab");
  await page.keyboard.type(String(book.publishedYear));
  await page.keyboard.press("Enter");

  await expect(bookPage.registerRegion.getByText(`"${book.title}" registered.`)).toBeVisible();
});

test("AC-24: the page fits a 360 px wide screen without horizontal scrolling", async ({ page }) => {
  const book = buildUniqueBook();
  const bookPage = createBookPage(page);
  await bookPage.open();
  await bookPage.register({ book });
  await expect(bookPage.registerRegion.getByText(`"${book.title}" registered.`)).toBeVisible();

  await page.setViewportSize(NARROW_VIEWPORT);
  await page.reload();
  await expect(
    bookPage.findRegion.getByRole("row", { name: new RegExp(book.title) }),
  ).toBeVisible();

  const hasNoHorizontalScroll = await page.evaluate(
    () => document.documentElement.scrollWidth <= document.documentElement.clientWidth,
  );
  expect(hasNoHorizontalScroll).toBe(true);
});

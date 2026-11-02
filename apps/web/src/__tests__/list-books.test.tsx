import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { act, render, screen, waitForElementToBeRemoved, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { axe } from "vitest-axe";
import { App } from "../app.tsx";
import { buildAsset } from "../test-support/asset-factories.ts";
import { listAssetsHandler, listAssetsRawHandler } from "../test-support/asset-handlers.ts";
import { createGate } from "../test-support/create-gate.ts";
import { server } from "../test-support/msw-server.ts";

const LOADING_TEXT = "Loading books…";
const EMPTY_TEXT = "No books registered yet.";
const DUNE = buildAsset();
const EMMA = buildAsset({
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  title: "Emma",
  author: "Jane Austen",
  isbn: "9780141439587",
  publishedYear: 1815,
  genre: null,
});

test("given the list is slow, when the page opens, then it shows the loading text", async () => {
  server.use(listAssetsHandler({ gate: createGate() }));

  render(<App />);

  expect(screen.getByText(LOADING_TEXT)).toBeDefined();
});

test("given no books are registered, when the list loads, then it shows the empty text and announces 0 books", async () => {
  server.use(listAssetsHandler());

  render(<App />);

  expect(await screen.findByText(EMPTY_TEXT)).toBeDefined();
  expect(screen.queryByText(LOADING_TEXT)).toBeNull();
  expect(findBooksRegion().getByRole("status").textContent).toBe("0 books shown");
});

test("given the page, when it opens, then it has the page title, main heading and both sections", () => {
  server.use(listAssetsHandler());
  render(<App />);
  const pageHtml = readFileSync(resolve(process.cwd(), "index.html"), "utf8");
  const pageTitle = new DOMParser().parseFromString(pageHtml, "text/html").title;

  expect(pageTitle).toBe("Library books");
  expect(screen.getByRole("heading", { level: 1, name: "Library books" })).toBeDefined();
  expect(screen.getByRole("region", { name: "Register a book" })).toBeDefined();
  expect(screen.getByRole("region", { name: "Find books" })).toBeDefined();
});

test.each([
  { scenario: "the service answers 500", status: 500, body: { error: "InternalError" } },
  { scenario: "the list body is malformed", status: 200, body: { items: "nope" } },
])(
  "given $scenario, when the list loads, then it shows neither loading nor empty text",
  async ({ status, body }) => {
    server.use(listAssetsRawHandler({ status, body }));

    render(<App />);

    await waitForElementToBeRemoved(() => screen.queryByText(LOADING_TEXT));
    expect(screen.queryByText(EMPTY_TEXT)).toBeNull();
    expect(findBooksRegion().getByRole("status").textContent).toBe("");
  },
);

test("given books with and without a genre, when the list loads, then each row shows its details in its column", async () => {
  server.use(listAssetsHandler({ items: [DUNE, EMMA] }));

  render(<App />);

  const duneRow = await screen.findByRole("row", { name: /Dune/ });
  expect(cellTexts(duneRow)).toEqual([
    "Dune",
    "Frank Herbert",
    "9780306406157",
    "1965",
    "Science fiction",
  ]);
  expect(cellTexts(screen.getByRole("row", { name: /Emma/ }))).toEqual([
    "Emma",
    "Jane Austen",
    "9780141439587",
    "1815",
    "No genre",
  ]);
});

test("given books, when the list loads, then the table has the five column headers", async () => {
  server.use(listAssetsHandler({ items: [DUNE] }));

  render(<App />);

  await screen.findByRole("table");
  expect(screen.getAllByRole("columnheader").map((header) => header.textContent)).toEqual([
    "Title",
    "Author",
    "ISBN",
    "Year",
    "Genre",
  ]);
});

test("given books, when the list loads, then the table is named Registered books", async () => {
  server.use(listAssetsHandler({ items: [DUNE] }));

  render(<App />);

  expect(await screen.findByRole("table", { name: "Registered books" })).toBeDefined();
});

test("given books, when the list loads, then the scrollable books region is reachable by keyboard", async () => {
  server.use(listAssetsHandler({ items: [DUNE] }));

  render(<App />);

  await screen.findByRole("table");
  expect(screen.getByRole("region", { name: "Books list" }).tabIndex).toBe(0);
});

test("given two books, when the list loads, then it announces 2 books shown", async () => {
  server.use(listAssetsHandler({ items: [DUNE, EMMA] }));

  render(<App />);

  await screen.findByRole("table");
  expect(findBooksRegion().getByRole("status").textContent).toBe("2 books shown");
});

test("given one book, when the list loads, then it announces 1 book shown", async () => {
  server.use(listAssetsHandler({ items: [buildAsset()] }));

  render(<App />);

  await screen.findByRole("table");
  expect(findBooksRegion().getByRole("status").textContent).toBe("1 book shown");
});

test("given a script-like title, when the list loads, then it shows literal text with no image", async () => {
  const scriptTitle = "<img src=x onerror=alert(1)>";
  server.use(listAssetsHandler({ items: [buildAsset({ title: scriptTitle })] }));

  render(<App />);

  expect(await screen.findByText(scriptTitle)).toBeDefined();
  expect(screen.queryByRole("img")).toBeNull();
});

const LIST_ERROR_MESSAGE = "Could not load books. Check the service is running and try again.";

const LIST_FAILURES: readonly ListFailure[] = [
  { name: "cannot be reached", handler: http.get("/assets", () => HttpResponse.error()) },
  {
    name: "responds with a server error",
    handler: listAssetsRawHandler({ status: 500, body: { error: "InternalError" } }),
  },
  {
    name: "responds with an unexpected status",
    handler: listAssetsRawHandler({ status: 404, body: { error: "NotFound" } }),
  },
  {
    name: "responds with a body the page cannot read",
    handler: listAssetsRawHandler({ status: 200, body: { items: "nope" } }),
  },
];

test.each(LIST_FAILURES)(
  "given the service $name, when the list loads, then it asks staff to retry",
  async ({ handler }) => {
    server.use(handler);

    render(<App />);

    await screen.findByText(LIST_ERROR_MESSAGE);
    const alert = findBooksRegion().getByRole("alert");
    expect(alert.textContent).toContain(LIST_ERROR_MESSAGE);
    expect(within(alert).getByRole("button", { name: "Retry" })).toBeDefined();
  },
);

test("given the list failed, when staff Retry after the service recovers, then it lists the books and clears the message", async () => {
  server.use(listAssetsRawHandler({ status: 500, body: { error: "InternalError" } }));
  render(<App />);
  const retryButton = await screen.findByRole("button", { name: "Retry" });
  server.use(listAssetsHandler({ items: [buildAsset()] }));

  await userEvent.setup().click(retryButton);

  expect(await screen.findByRole("row", { name: /Dune/ })).toBeDefined();
  expect(screen.queryByText(LIST_ERROR_MESSAGE)).toBeNull();
});

test("given the list failed, when a Retry succeeds, then focus moves to the Find books heading and the count is announced", async () => {
  server.use(listAssetsRawHandler({ status: 500, body: { error: "InternalError" } }));
  render(<App />);
  const retryButton = await screen.findByRole("button", { name: "Retry" });
  server.use(listAssetsHandler({ items: [buildAsset()] }));

  await userEvent.setup().click(retryButton);

  await screen.findByRole("table");
  expect(document.activeElement).toBe(screen.getByRole("heading", { name: "Find books" }));
  expect(findBooksRegion().getByRole("status").textContent).toBe("1 book shown");
});

test("given the list failed, when Retry fails again, then focus stays on Retry", async () => {
  server.use(listAssetsRawHandler({ status: 500, body: { error: "InternalError" } }));
  render(<App />);
  const retryButton = await screen.findByRole("button", { name: "Retry" });
  const gate = createGate();
  const handled = createGate();
  server.use(
    http.get("/assets", async () => {
      await gate.wait;
      handled.open();
      return HttpResponse.json({ error: "InternalError" }, { status: 500 });
    }),
  );

  await userEvent.setup().click(retryButton);
  gate.open();
  await act(async () => {
    await handled.wait;
  });

  expect(document.activeElement).toBe(retryButton);
  expect(document.activeElement).not.toBe(screen.getByRole("heading", { name: "Find books" }));
});

test("given staff typed in the form, when reloading the list fails, then the typed values are kept", async () => {
  server.use(listAssetsRawHandler({ status: 500, body: { error: "InternalError" } }));
  render(<App />);
  const user = userEvent.setup();
  await user.type(registerForm().getByLabelText("Title"), "Dune");
  await user.type(registerForm().getByLabelText("Author"), "Frank Herbert");

  await user.click(await screen.findByRole("button", { name: "Retry" }));

  await screen.findByRole("button", { name: "Retry" });
  expect(registerForm().getByLabelText("Title")).toHaveProperty("value", "Dune");
  expect(registerForm().getByLabelText("Author")).toHaveProperty("value", "Frank Herbert");
});

test("given the list failed, when the retry message is shown, then the page has no accessibility violations", async () => {
  server.use(listAssetsRawHandler({ status: 500, body: { error: "InternalError" } }));
  const { container } = render(<App />);
  await screen.findByText(LIST_ERROR_MESSAGE);

  expect(await axe(container)).toHaveNoViolations();
});

test("given books are listed, when the page is shown, then it has no accessibility violations", async () => {
  server.use(listAssetsHandler({ items: [DUNE, EMMA] }));
  const { container } = render(<App />);
  await screen.findByRole("table");

  expect(await axe(container)).toHaveNoViolations();
});

const findBooksRegion = () => within(screen.getByRole("region", { name: "Find books" }));

const cellTexts = (row: HTMLElement): (string | null)[] =>
  within(row)
    .getAllByRole("cell")
    .map((cell) => cell.textContent);

const registerForm = () => within(screen.getByRole("region", { name: "Register a book" }));

interface ListFailure {
  readonly name: string;
  readonly handler: ReturnType<typeof listAssetsRawHandler>;
}

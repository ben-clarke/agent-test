import { VALIDATION_MESSAGES } from "@library/schemas";
import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { axe } from "vitest-axe";
import { App } from "../app.tsx";
import { accessibleDescription } from "../test-support/accessible-description.ts";
import { buildAsset } from "../test-support/asset-factories.ts";
import {
  listAssetsHandler,
  registerAssetHandler,
  registerAssetRawHandler,
} from "../test-support/asset-handlers.ts";
import { server } from "../test-support/msw-server.ts";

const ISBN_MESSAGE = VALIDATION_MESSAGES.isbnInvalid;
const YEAR_MESSAGE = "Year must be a whole number from 1450 to 2026";
const RETRY_MESSAGE = "Could not register the book. Check the service is running and try again.";
const BODY_MESSAGE = VALIDATION_MESSAGES.bodyNotJsonObject;

const rejection = (details: readonly { field: string; message: string }[]) => ({
  status: 400,
  body: { error: "ValidationError", details },
});

const fillDune = async (): Promise<ReturnType<typeof userEvent.setup>> => {
  const user = userEvent.setup();
  await user.type(registerForm().getByLabelText("Title"), "Dune");
  await user.type(registerForm().getByLabelText("Author"), "Frank Herbert");
  await user.type(registerForm().getByLabelText("ISBN"), "12345");
  await user.type(registerForm().getByLabelText("Year"), "3000");
  return user;
};

const submit = async (user: ReturnType<typeof userEvent.setup>): Promise<void> =>
  user.click(screen.getByRole("button", { name: "Register book" }));

const renderRejectedForm = async (): Promise<ReturnType<typeof userEvent.setup>> => {
  server.use(
    listAssetsHandler(),
    registerAssetRawHandler(
      rejection([
        { field: "isbn", message: ISBN_MESSAGE },
        { field: "publishedYear", message: YEAR_MESSAGE },
      ]),
    ),
  );
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = await fillDune();
  await submit(user);
  await screen.findByText(ISBN_MESSAGE);
  return user;
};

test("given the API rejects ISBN and Year, when staff register the book, then each message is beside its field, the first invalid field is focused and the input is kept", async () => {
  await renderRejectedForm();

  const isbn = registerForm().getByRole("textbox", { name: "ISBN" });
  const year = registerForm().getByRole("textbox", { name: "Year" });
  expect(accessibleDescription(isbn)).toBe(ISBN_MESSAGE);
  expect(accessibleDescription(year)).toBe(YEAR_MESSAGE);
  expect(isbn.getAttribute("aria-invalid")).toBe("true");
  expect(year.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(isbn);
  expect(registerForm().getByLabelText("Title")).toHaveProperty("value", "Dune");
  expect(isbn).toHaveProperty("value", "12345");
  expect(year).toHaveProperty("value", "3000");
  expect(screen.queryByText(/registered\./)).toBeNull();
});

test("given the API rejects Genre, when staff register the book, then Genre is marked invalid and described by its message", async () => {
  server.use(
    listAssetsHandler(),
    registerAssetRawHandler(
      rejection([{ field: "genre", message: VALIDATION_MESSAGES.genreInvalid }]),
    ),
  );
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = userEvent.setup();
  await submit(user);

  const genre = await screen.findByRole("combobox", { name: "Genre (optional)" });
  await waitFor(() => expect(accessibleDescription(genre)).toBe(VALIDATION_MESSAGES.genreInvalid));
  expect(genre.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(genre);
});

test("given Year is empty, when staff register the book, then it asks for a year and sends no publishedYear", async () => {
  const requests: unknown[] = [];
  server.use(
    listAssetsHandler(),
    registerAssetRawHandler({
      ...rejection([{ field: "publishedYear", message: VALIDATION_MESSAGES.yearRequired }]),
      onRequest: (body) => requests.push(body),
    }),
  );
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = userEvent.setup();
  await user.type(registerForm().getByLabelText("Title"), "Dune");
  await user.type(registerForm().getByLabelText("Author"), "Frank Herbert");
  await user.type(registerForm().getByLabelText("ISBN"), "978-0-306-40615-7");
  await submit(user);

  expect(await screen.findByText("Enter a year")).toBeDefined();
  expect(accessibleDescription(registerForm().getByLabelText("Year"))).toBe("Enter a year");
  expect(requests).toEqual([{ title: "Dune", author: "Frank Herbert", isbn: "978-0-306-40615-7" }]);
});

test("given several field errors, when staff edit one field, then only its own error clears", async () => {
  const user = await renderRejectedForm();

  await user.type(registerForm().getByLabelText("ISBN"), "6");

  expect(screen.queryByText(ISBN_MESSAGE)).toBeNull();
  expect(registerForm().getByLabelText("ISBN").getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByText(YEAR_MESSAGE)).toBeDefined();
});

test("given a rejection for a field not on the form, when staff register the book, then the detail shows in the alert", async () => {
  server.use(
    listAssetsHandler(),
    registerAssetRawHandler(rejection([{ field: "body", message: BODY_MESSAGE }])),
  );
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = userEvent.setup();
  await submit(user);

  const alert = within(screen.getByRole("alert"));
  expect(await alert.findByText(BODY_MESSAGE)).toBeDefined();
});

test("given field errors, when a later registration succeeds, then the field errors clear", async () => {
  const user = await renderRejectedForm();
  server.use(
    listAssetsHandler({ items: [buildAsset()] }),
    registerAssetHandler({ asset: buildAsset(), onRequest: () => undefined }),
  );

  await submit(user);

  await screen.findByText('"Dune" registered.');
  expect(screen.queryByText(ISBN_MESSAGE)).toBeNull();
  expect(screen.queryByText(YEAR_MESSAGE)).toBeNull();
});

test("given the ISBN is already registered, when staff register the book, then the duplicate message is beside ISBN, ISBN is focused and the input is kept", async () => {
  server.use(
    listAssetsHandler(),
    registerAssetRawHandler({
      status: 409,
      body: {
        error: "DuplicateIsbn",
        details: [{ field: "isbn", message: VALIDATION_MESSAGES.isbnDuplicate }],
      },
    }),
  );
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = await fillDune();
  await submit(user);

  await screen.findByText(VALIDATION_MESSAGES.isbnDuplicate);
  const isbn = registerForm().getByRole("textbox", { name: "ISBN" });
  expect(accessibleDescription(isbn)).toBe(VALIDATION_MESSAGES.isbnDuplicate);
  expect(isbn.getAttribute("aria-invalid")).toBe("true");
  expect(document.activeElement).toBe(isbn);
  expect(isbn).toHaveProperty("value", "12345");
  expect(registerForm().getByLabelText("Title")).toHaveProperty("value", "Dune");
  expect(registerForm().getByLabelText("Author")).toHaveProperty("value", "Frank Herbert");
  expect(registerForm().getByLabelText("Year")).toHaveProperty("value", "3000");
});

test("given a 409 that is not a duplicate-ISBN error, when staff register the book, then only the retry message shows", async () => {
  server.use(
    listAssetsHandler(),
    registerAssetRawHandler({ status: 409, body: { error: "Unexpected" } }),
  );
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = await fillDune();
  await submit(user);

  await waitFor(() => expect(screen.getByRole("button", { name: "Register book" })).toBeDefined());
  expect(registerForm().getByLabelText("ISBN").getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByRole("alert").textContent).toBe(RETRY_MESSAGE);
});

test("given a 400 that is not a validation error, when staff register the book, then only the retry message shows", async () => {
  server.use(
    listAssetsHandler(),
    registerAssetRawHandler({ status: 400, body: { error: "Unexpected" } }),
  );
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = await fillDune();
  await submit(user);

  await waitFor(() => expect(screen.getByRole("button", { name: "Register book" })).toBeDefined());
  expect(registerForm().getByLabelText("ISBN").getAttribute("aria-invalid")).toBeNull();
  expect(screen.getByRole("alert").textContent).toBe(RETRY_MESSAGE);
});

const registerForm = () => within(screen.getByRole("region", { name: "Register a book" }));

test("given field errors are shown, when the page is shown, then it has no accessibility violations", async () => {
  await renderRejectedForm();

  expect(await axe(document.body)).toHaveNoViolations();
});

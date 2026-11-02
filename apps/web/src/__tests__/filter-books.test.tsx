import { act, render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { axe } from "vitest-axe";
import { buildCreateAssetSchema, GenreSchema, type Asset } from "@library/schemas";
import { App } from "../app.tsx";
import { GENRE_LABELS } from "../genre-labels.ts";
import { accessibleDescription } from "../test-support/accessible-description.ts";
import { buildAsset } from "../test-support/asset-factories.ts";
import { listAssetsHandler, listAssetsRawHandler } from "../test-support/asset-handlers.ts";
import { createGate, type Gate } from "../test-support/create-gate.ts";
import { server } from "../test-support/msw-server.ts";

const DUNE = buildAsset();
const EMMA = buildAsset({
  id: "7c9e6679-7425-40de-944b-e07fc1f90ae7",
  title: "Emma",
  author: "Jane Austen",
  isbn: "9780141439587",
  publishedYear: 1815,
  genre: null,
});

test("given Genre and Author are filled, when staff apply the filters, then only those two are sent", async () => {
  const queries = useRecordingHandler([DUNE]);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Dune");

  await user.selectOptions(findBooks().getByLabelText("Genre"), "Science fiction");
  await user.type(findBooks().getByLabelText("Author"), "Frank Herbert");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  await waitFor(() =>
    expect(queries.at(-1)).toEqual({ genre: "science-fiction", author: "Frank Herbert" }),
  );
  expect(screen.getByText("Dune")).toBeDefined();
});

test("given Title contains and Year are filled, when staff apply the filters, then only those two are sent", async () => {
  const queries = useRecordingHandler([DUNE]);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Dune");

  await user.type(findBooks().getByLabelText("Title contains"), "une");
  await user.type(findBooks().getByLabelText("Year"), "1965");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  await waitFor(() => expect(queries.at(-1)).toEqual({ q: "une", publishedYear: "1965" }));
});

test("given a blank Author, when staff apply the filters, then no filter is sent", async () => {
  const queries = useRecordingHandler([DUNE]);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Dune");

  await user.type(findBooks().getByLabelText("Author"), "   ");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  await waitFor(() => expect(queries.length).toBe(2));
  expect(queries.at(-1)).toEqual({});
});

test("given the page opens, when staff look at Genre, then it offers All genres plus the display label of every genre", async () => {
  server.use(http.get("/assets", () => HttpResponse.json({ items: [] })));
  render(<App />);
  await screen.findByText("No books registered yet.");

  const options = within(findBooks().getByLabelText("Genre")).getAllByRole("option");

  expect(options.map((option) => option.textContent)).toEqual([
    "All genres",
    ...GenreSchema.options.map((genre) => GENRE_LABELS[genre]),
  ]);
});

test("given focus is on Author, when staff press Tab, then it moves through Title contains, Year and Genre in order", async () => {
  useRecordingHandler([DUNE]);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Dune");

  await user.click(findBooks().getByLabelText("Author"));
  await user.tab();
  expect(document.activeElement).toBe(findBooks().getByLabelText("Title contains"));
  await user.tab();
  expect(document.activeElement).toBe(findBooks().getByLabelText("Year"));
  await user.tab();
  expect(document.activeElement).toBe(findBooks().getByLabelText("Genre"));
});

test("given Title contains is filled, when staff press Enter in it, then the filters are applied", async () => {
  const queries = useRecordingHandler([DUNE]);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Dune");

  await user.click(findBooks().getByLabelText("Title contains"));
  await user.keyboard("une{Enter}");

  await waitFor(() => expect(queries.at(-1)).toEqual({ q: "une" }));
});

test("given no book matches, when staff apply the filters, then it shows the no-match text", async () => {
  server.use(
    http.get("/assets", ({ request }) =>
      HttpResponse.json({ items: new URL(request.url).search === "" ? [DUNE] : [] }),
    ),
  );
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Dune");

  await user.type(findBooks().getByLabelText("Author"), "Nobody");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  expect(await screen.findByText("No books match these filters.")).toBeDefined();
});

test("given filters are applied, when staff clear them, then every filter resets and all books are listed again", async () => {
  server.use(
    http.get("/assets", ({ request }) =>
      HttpResponse.json({ items: new URL(request.url).search === "" ? [DUNE, EMMA] : [] }),
    ),
  );
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Emma");
  await user.type(findBooks().getByLabelText("Author"), "Nobody");
  await user.selectOptions(findBooks().getByLabelText("Genre"), "Fantasy");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));
  await screen.findByText("No books match these filters.");

  await user.click(findBooks().getByRole("button", { name: "Clear filters" }));

  await screen.findByText("Emma");
  expect(findBooks().getByLabelText("Author")).toHaveProperty("value", "");
  expect(findBooks().getByLabelText("Genre")).toHaveProperty("value", "");
  expect(screen.getByText("Dune")).toBeDefined();
});

test("given an earlier filter response is slow, when a later one arrives first, then only the later results show and no error appears", async () => {
  const janeGate = createGate();
  const frankGate = createGate();
  const frankRequested = createGate();
  const janeAnswered = createGate();
  const janeBook = buildAsset({ title: "Persuasion", author: "Jane Austen" });
  server.use(
    http.get("/assets", async ({ request }) => {
      const author = new URL(request.url).searchParams.get("author");
      if (author === "Jane Austen") {
        await janeGate.wait;
        janeAnswered.open();
        return HttpResponse.json({ items: [janeBook] });
      }
      if (author === "Frank Herbert") {
        frankRequested.open();
        await frankGate.wait;
        return HttpResponse.json({ items: [DUNE] });
      }
      return HttpResponse.json({ items: [EMMA] });
    }),
  );
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Emma");

  await user.type(findBooks().getByLabelText("Author"), "Jane Austen");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));
  await user.clear(findBooks().getByLabelText("Author"));
  await user.type(findBooks().getByLabelText("Author"), "Frank Herbert");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));
  await frankRequested.wait;

  expect(screen.queryByText(/Could not load books/)).toBeNull();

  frankGate.open();
  await screen.findByText("Dune");
  janeGate.open();
  await act(async () => {
    await janeAnswered.wait;
  });

  expect(screen.queryByText("Persuasion")).toBeNull();
  expect(screen.queryByText(/Could not load books/)).toBeNull();
});

test("given a list request is pending, when the page closes, then it causes no error or React warning", async () => {
  const gate = createGate();
  const requested = createGate();
  const aborted = createGate();
  const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
  server.use(
    http.get("/assets", async ({ request }) => {
      request.signal.addEventListener("abort", aborted.open);
      requested.open();
      await gate.wait;
      return HttpResponse.json({ items: [] });
    }),
  );
  const { unmount } = render(<App />);
  await requested.wait;

  unmount();
  await act(async () => {
    await aborted.wait;
  });
  gate.open();

  expect(consoleError).not.toHaveBeenCalled();
});

test("given the API rejects Year, when staff apply the filters, then Year is explained and focused", async () => {
  useYearValidatingHandler([DUNE, EMMA]);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Emma");

  await user.type(findBooks().getByLabelText("Year"), "abc");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  const yearField = findBooks().getByLabelText("Year");
  await waitFor(() => expect(document.activeElement).toBe(yearField));
  expect(accessibleDescription(yearField)).toBe(YEAR_ERROR_MESSAGE);
});

test("given the API rejects Year, when staff apply the filters, then the not-applied note shows", async () => {
  useYearValidatingHandler([DUNE]);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Dune");

  await user.type(findBooks().getByLabelText("Year"), "abc");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  expect(await findBooks().findByText(NOT_APPLIED_NOTE)).toBeDefined();
});

test("given the API rejects Year, when staff apply the filters, then the previous books stay listed and are announced", async () => {
  useYearValidatingHandler([DUNE, EMMA]);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Emma");

  await user.type(findBooks().getByLabelText("Year"), "abc");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  await findBooks().findByText(NOT_APPLIED_NOTE);
  expect(screen.getByText("Emma")).toBeDefined();
  expect(screen.getByText("Dune")).toBeDefined();
  expect(findBooks().getByRole("status").textContent).toBe("2 books shown");
});

test("given the API rejects Year, when staff apply the filters, then no empty-state text replaces the previous books", async () => {
  useYearValidatingHandler([DUNE, EMMA]);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Emma");

  await user.type(findBooks().getByLabelText("Year"), "abc");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  await findBooks().findByText(NOT_APPLIED_NOTE);
  expect(screen.queryByText("No books match these filters.")).toBeNull();
  expect(screen.queryByText("No books registered yet.")).toBeNull();
});

test("given the API rejects Year, when staff apply the filters, then the note is announced through a polite live region that existed before", async () => {
  useYearValidatingHandler([DUNE]);
  const { container } = render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Dune");
  const liveRegions = [...container.querySelectorAll("div[aria-live=polite]")];

  await user.type(findBooks().getByLabelText("Year"), "abc");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  const note = await findBooks().findByText(NOT_APPLIED_NOTE);
  expect(liveRegions.some((region) => region.contains(note))).toBe(true);
});

test("given Year was rejected, when staff change Year and apply a valid value, then the year error and the note clear", async () => {
  useYearValidatingHandler([DUNE, EMMA]);
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Emma");
  await user.type(findBooks().getByLabelText("Year"), "abc");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));
  await screen.findByText(YEAR_ERROR_MESSAGE);

  await user.clear(findBooks().getByLabelText("Year"));

  expect(screen.queryByText(YEAR_ERROR_MESSAGE)).toBeNull();
  expect(findBooks().getByText(NOT_APPLIED_NOTE)).toBeDefined();

  await user.type(findBooks().getByLabelText("Year"), "1965");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  await waitFor(() => expect(screen.queryByText(NOT_APPLIED_NOTE)).toBeNull());
  expect(screen.getByText("Dune")).toBeDefined();
  expect(screen.queryByText("Emma")).toBeNull();
});

test("given a filter error shows, when staff apply the unchanged filters again, then every filter error clears", async () => {
  const requestedYears: (string | null)[] = [];
  server.use(
    http.get("/assets", ({ request }) => {
      requestedYears.push(new URL(request.url).searchParams.get("publishedYear"));
      return requestedYears.length === REJECTED_REQUEST_NUMBER
        ? HttpResponse.json(
            {
              error: "ValidationError",
              details: [{ field: "publishedYear", message: YEAR_ERROR_MESSAGE }],
            },
            { status: 400 },
          )
        : HttpResponse.json({ items: [DUNE] });
    }),
  );
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Dune");
  await user.type(findBooks().getByLabelText("Year"), "abc");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));
  await screen.findByText(YEAR_ERROR_MESSAGE);

  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  await waitFor(() => expect(screen.queryByText(YEAR_ERROR_MESSAGE)).toBeNull());
  expect(requestedYears).toEqual([null, "abc", "abc"]);
});

test("given the API rejects Genre and no books were listed, when the page opens, then Genre is explained and no table shows", async () => {
  server.use(
    listAssetsRawHandler({
      status: 400,
      body: {
        error: "ValidationError",
        details: [{ field: "genre", message: "Choose a genre from the list" }],
      },
    }),
  );
  render(<App />);

  await screen.findByText("Choose a genre from the list");
  const genreField = findBooks().getByLabelText("Genre");

  expect(accessibleDescription(genreField)).toBe("Choose a genre from the list");
  expect(genreField.getAttribute("aria-invalid")).toBe("true");
  expect(findBooks().getByText(NOT_APPLIED_NOTE)).toBeDefined();
  expect(screen.queryByRole("table")).toBeNull();
});

test("given the API rejects the title text, when the page opens, then the error is described beside Title contains", async () => {
  server.use(
    listAssetsRawHandler({
      status: 400,
      body: { error: "ValidationError", details: [{ field: "q", message: "Bad title text" }] },
    }),
  );
  render(<App />);

  await screen.findByText("Bad title text");

  expect(accessibleDescription(findBooks().getByLabelText("Title contains"))).toBe(
    "Bad title text",
  );
});

test("given the rejection names no filter on the page, when the page opens, then the note shows and focus does not move", async () => {
  server.use(
    listAssetsRawHandler({
      status: 400,
      body: {
        error: "ValidationError",
        details: [{ field: "authr", message: '"authr" is not a recognised filter' }],
      },
    }),
  );
  render(<App />);

  await screen.findByText(NOT_APPLIED_NOTE);

  expect(document.activeElement).toBe(document.body);
});

test("given staff typed in the register form, when Apply filters fails to reload the list, then the typed values are kept", async () => {
  server.use(listAssetsHandler({ items: [DUNE] }));
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("Dune");
  await user.type(registerForm().getByLabelText("Title"), "Emma");
  await user.type(registerForm().getByLabelText("Author"), "Jane Austen");
  server.use(listAssetsRawHandler({ status: 500, body: { error: "InternalError" } }));

  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  await screen.findByRole("button", { name: "Retry" });
  expect(registerForm().getByLabelText("Title")).toHaveProperty("value", "Emma");
  expect(registerForm().getByLabelText("Author")).toHaveProperty("value", "Jane Austen");
});

test("given a filter is applied, when staff register a matching book, then it is listed and announced", async () => {
  const { reloadGate } = useCatalogue();
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("No books registered yet.");
  await user.selectOptions(findBooks().getByLabelText("Genre"), "Fantasy");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  await registerBook({ user, title: "Earthsea", isbn: "9780306406157", genre: "Fantasy" });
  reloadGate.open();

  await waitFor(() => expect(registrationStatus().textContent).toBe('"Earthsea" registered.'));
  expect(screen.getByText("Earthsea")).toBeDefined();
});

test("given a book was registered, when a later filter hides it, then the registration announcement is unchanged", async () => {
  const { reloadGate } = useCatalogue();
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("No books registered yet.");
  await registerBook({ user, title: "Earthsea", isbn: "9780306406157", genre: "Fantasy" });
  reloadGate.open();
  await waitFor(() => expect(registrationStatus().textContent).toBe('"Earthsea" registered.'));

  await user.selectOptions(findBooks().getByLabelText("Genre"), "Mystery");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));

  await screen.findByText("No books match these filters.");
  expect(registrationStatus().textContent).toBe('"Earthsea" registered.');
});

test("given a Retry is pending, when staff apply filters, then focus does not move to the heading", async () => {
  server.use(listAssetsRawHandler({ status: 500, body: { error: "InternalError" } }));
  render(<App />);
  const user = userEvent.setup();
  const retryButton = await screen.findByRole("button", { name: "Retry" });
  const retryGate = createGate();
  server.use(
    http.get("/assets", async ({ request }) => {
      if (new URL(request.url).search === "") {
        await retryGate.wait;
      }
      return HttpResponse.json({ items: [DUNE] });
    }),
  );
  await user.click(retryButton);
  await user.type(findBooks().getByLabelText("Author"), "Frank Herbert");

  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));
  await screen.findByText("Dune");
  retryGate.open();

  expect(document.activeElement).not.toBe(screen.getByRole("heading", { name: "Find books" }));
});

test("given a filter hides new books, when staff register one, then the hidden-by-filters announcement comes only after the reload settles", async () => {
  const { reloadGate } = useCatalogue();
  render(<App />);
  const user = userEvent.setup();
  await screen.findByText("No books registered yet.");
  await user.selectOptions(findBooks().getByLabelText("Genre"), "Fantasy");
  await user.click(findBooks().getByRole("button", { name: "Apply filters" }));
  await screen.findByText("No books match these filters.");

  await registerBook({ user, title: "Rebecca", isbn: "9780141439587", genre: "Mystery" });
  expect(registrationStatus().textContent).toBe("");
  reloadGate.open();

  await waitFor(() =>
    expect(registrationStatus().textContent).toBe(
      '"Rebecca" registered. It is hidden by the current filters — clear them to see it.',
    ),
  );
  expect(screen.queryByText("Rebecca")).toBeNull();
});

test("given books are listed with the filters shown, when the page is shown, then it has no accessibility violations", async () => {
  server.use(http.get("/assets", () => HttpResponse.json({ items: [DUNE] })));
  const { container } = render(<App />);
  await screen.findByText("Dune");

  expect(await axe(container)).toHaveNoViolations();
});

const YEAR_ERROR_MESSAGE = "Year must be a whole number of up to 4 digits, for example 1965";
const REJECTED_REQUEST_NUMBER = 2;
const NOT_APPLIED_NOTE = "Filters not applied — fix the highlighted filter";

const registerForm = () => within(screen.getByRole("region", { name: "Register a book" }));

const registrationStatus = (): HTMLElement =>
  within(screen.getByRole("region", { name: "Register a book" })).getByRole("status");

const registerBook = async ({ user, title, isbn, genre }: RegisterBookOptions): Promise<void> => {
  await user.type(registerForm().getByLabelText("Title"), title);
  await user.type(registerForm().getByLabelText("Author"), "Some Author");
  await user.type(registerForm().getByLabelText("ISBN"), isbn);
  await user.type(registerForm().getByLabelText("Year"), "1970");
  await user.selectOptions(registerForm().getByLabelText("Genre (optional)"), genre);
  await user.click(screen.getByRole("button", { name: "Register book" }));
};

const useYearValidatingHandler = (items: readonly Asset[]): void => {
  server.use(
    http.get("/assets", ({ request }) => {
      const year = new URL(request.url).searchParams.get("publishedYear");
      if (year === null) {
        return HttpResponse.json({ items });
      }
      if (!/^\d{1,4}$/.test(year)) {
        return HttpResponse.json(
          {
            error: "ValidationError",
            details: [{ field: "publishedYear", message: YEAR_ERROR_MESSAGE }],
          },
          { status: 400 },
        );
      }
      return HttpResponse.json({
        items: items.filter((item) => item.publishedYear === Number(year)),
      });
    }),
  );
};

const useCatalogue = (): { readonly reloadGate: Gate } => {
  const reloadGate = createGate();
  const store: Asset[] = [];
  server.use(
    http.get("/assets", async ({ request }) => {
      if (store.length > 0) {
        await reloadGate.wait;
      }
      const genre = new URL(request.url).searchParams.get("genre");
      return HttpResponse.json({
        items: store.filter((asset) => genre === null || asset.genre === genre),
      });
    }),
    http.post("/assets", async ({ request }) => {
      const body = CREATE_ASSET_SCHEMA.parse(await request.json());
      const asset = buildAsset({ ...body, genre: body.genre ?? null, id: crypto.randomUUID() });
      store.unshift(asset);
      return HttpResponse.json(asset, { status: 201 });
    }),
  );
  return { reloadGate };
};

const CREATE_ASSET_SCHEMA = buildCreateAssetSchema({ currentYear: 2026 });

const findBooks = () => within(screen.getByRole("region", { name: "Find books" }));

const useRecordingHandler = (items: readonly ReturnType<typeof buildAsset>[]) => {
  const queries: Record<string, string>[] = [];
  server.use(
    http.get("/assets", ({ request }) => {
      queries.push(Object.fromEntries(new URL(request.url).searchParams));
      return HttpResponse.json({ items });
    }),
  );
  return queries;
};

interface RegisterBookOptions {
  readonly user: ReturnType<typeof userEvent.setup>;
  readonly title: string;
  readonly isbn: string;
  readonly genre: string;
}

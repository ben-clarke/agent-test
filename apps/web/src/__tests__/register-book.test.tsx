import { render, screen, waitFor, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { axe } from "vitest-axe";
import { GenreSchema } from "@library/schemas";
import { App } from "../app.tsx";
import { GENRE_LABELS } from "../genre-labels.ts";
import { buildAsset } from "../test-support/asset-factories.ts";
import {
  listAssetsHandler,
  listAssetsRawHandler,
  registerAssetHandler,
} from "../test-support/asset-handlers.ts";
import { createGate } from "../test-support/create-gate.ts";
import { server } from "../test-support/msw-server.ts";

const LOADING_TEXT = "Loading books…";
const REGISTERED_TEXT = '"Dune" registered.';

const fillDune = async (): Promise<ReturnType<typeof userEvent.setup>> => {
  const user = userEvent.setup();
  await user.type(registerForm().getByLabelText("Title"), "Dune");
  await user.type(registerForm().getByLabelText("Author"), "Frank Herbert");
  await user.type(registerForm().getByLabelText("ISBN"), "978-0-306-40615-7");
  await user.type(registerForm().getByLabelText("Year"), "1965");
  await user.selectOptions(registerForm().getByLabelText("Genre (optional)"), "Science fiction");
  return user;
};

const registrationStatus = (): HTMLElement =>
  within(screen.getByRole("region", { name: "Register a book" })).getByRole("status");

const useRegistrationFlow = (): {
  readonly requests: unknown[];
  readonly reloadGate: ReturnType<typeof createGate>;
} => {
  const requests: unknown[] = [];
  const reloadGate = createGate();
  server.use(
    listAssetsHandler(),
    registerAssetHandler({
      asset: buildAsset(),
      onRequest: (body) => {
        requests.push(body);
        server.use(listAssetsHandler({ items: [buildAsset()], gate: reloadGate }));
      },
    }),
  );
  return { requests, reloadGate };
};

test("given a filled form, when staff register the book, then the details are sent to the service", async () => {
  const { requests } = useRegistrationFlow();
  render(<App />);
  await screen.findByText("No books registered yet.");

  const user = await fillDune();
  await user.click(screen.getByRole("button", { name: "Register book" }));

  expect(requests).toEqual([
    {
      title: "Dune",
      author: "Frank Herbert",
      isbn: "978-0-306-40615-7",
      publishedYear: 1965,
      genre: "science-fiction",
    },
  ]);
});

test("given a filled form, when staff register the book, then the form is cleared", async () => {
  useRegistrationFlow();
  render(<App />);
  await screen.findByText("No books registered yet.");

  const user = await fillDune();
  await user.click(screen.getByRole("button", { name: "Register book" }));

  const fieldValues = ["Title", "Author", "ISBN", "Year", "Genre (optional)"].map((label) => {
    const field = registerForm().getByLabelText(label);
    return field instanceof HTMLInputElement || field instanceof HTMLSelectElement
      ? field.value
      : undefined;
  });
  expect(fieldValues).toEqual(["", "", "", "", ""]);
});

test("given a filled form, when staff register the book, then the announcement waits for the list reload and no loading state shows", async () => {
  const { reloadGate } = useRegistrationFlow();
  render(<App />);
  await screen.findByText("No books registered yet.");

  const user = await fillDune();
  await user.click(screen.getByRole("button", { name: "Register book" }));

  expect(screen.queryByText(LOADING_TEXT)).toBeNull();
  expect(registrationStatus().textContent).toBe("");

  reloadGate.open();

  await waitFor(() => expect(registrationStatus().textContent).toBe(REGISTERED_TEXT));
});

test("given a filled form, when staff register the book, then the list shows it", async () => {
  const { reloadGate } = useRegistrationFlow();
  render(<App />);
  await screen.findByText("No books registered yet.");

  const user = await fillDune();
  await user.click(screen.getByRole("button", { name: "Register book" }));
  reloadGate.open();

  expect(await screen.findByRole("row", { name: /Dune/ })).toBeDefined();
});

test("given books are listed, when a new registration reloads the list, then the existing rows stay visible and the table is busy until it settles", async () => {
  const emma = buildAsset({ id: "7c9e6679-7425-40de-944b-e07fc1f90ae7", title: "Emma" });
  const { reloadGate } = useRegistrationFlow();
  server.use(listAssetsHandler({ items: [emma] }));
  render(<App />);
  await screen.findByRole("row", { name: /Emma/ });

  const user = await fillDune();
  await user.click(screen.getByRole("button", { name: "Register book" }));

  await waitFor(() =>
    expect(screen.getByRole("table", { name: "Registered books" }).getAttribute("aria-busy")).toBe(
      "true",
    ),
  );
  expect(screen.getByRole("row", { name: /Emma/ })).toBeDefined();
  expect(screen.queryByText(LOADING_TEXT)).toBeNull();

  reloadGate.open();

  await waitFor(() =>
    expect(screen.getByRole("table", { name: "Registered books" }).getAttribute("aria-busy")).toBe(
      "false",
    ),
  );
  expect(screen.getByRole("row", { name: /Dune/ })).toBeDefined();
});

test("given a book was registered, when staff start the next book, then the success message clears", async () => {
  const { reloadGate } = useRegistrationFlow();
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = await fillDune();
  await user.click(screen.getByRole("button", { name: "Register book" }));
  reloadGate.open();
  await waitFor(() => expect(registrationStatus().textContent).toBe(REGISTERED_TEXT));

  await user.type(registerForm().getByLabelText("Title"), "E");

  expect(registrationStatus().textContent).toBe("");
});

test("given a book was registered, when staff submit again, then the success message clears", async () => {
  const { reloadGate } = useRegistrationFlow();
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = await fillDune();
  await user.click(screen.getByRole("button", { name: "Register book" }));
  reloadGate.open();
  await waitFor(() => expect(registrationStatus().textContent).toBe(REGISTERED_TEXT));
  server.use(http.post("/assets", () => new Promise<never>(() => undefined)));

  await user.click(screen.getByRole("button", { name: "Register book" }));

  expect(registrationStatus().textContent).toBe("");
});

test("given a registration is pending, when staff press Enter again, then the button stays focused and unavailable and no second registration is sent", async () => {
  const gate = createGate();
  const requests: unknown[] = [];
  server.use(
    listAssetsHandler(),
    http.post("/assets", async ({ request }) => {
      requests.push(await request.json());
      await gate.wait;
      return HttpResponse.json(buildAsset(), { status: 201 });
    }),
  );
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = await fillDune();

  await user.click(screen.getByRole("button", { name: "Register book" }));

  const pendingButton = await screen.findByRole("button", { name: "Registering…" });
  expect(pendingButton.getAttribute("aria-disabled")).toBe("true");
  expect(pendingButton.hasAttribute("disabled")).toBe(false);
  expect(document.activeElement).toBe(pendingButton);

  await user.type(registerForm().getByLabelText("Title"), "{Enter}");

  expect(requests).toHaveLength(1);

  gate.open();

  const availableButton = await screen.findByRole("button", { name: "Register book" });
  expect(availableButton.getAttribute("aria-disabled")).toBe("false");
});

test("given a registration is pending, when staff edit Title, then the typed text is kept", async () => {
  const gate = createGate();
  server.use(
    listAssetsHandler(),
    http.post("/assets", async () => {
      await gate.wait;
      return HttpResponse.json(buildAsset(), { status: 201 });
    }),
  );
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = await fillDune();
  await user.click(screen.getByRole("button", { name: "Register book" }));
  await screen.findByRole("button", { name: "Registering…" });

  await user.clear(registerForm().getByLabelText("Title"));
  await user.type(registerForm().getByLabelText("Title"), "Emma");
  gate.open();

  await screen.findByRole("button", { name: "Register book" });
  expect(registerForm().getByLabelText("Title")).toHaveProperty("value", "Emma");
  expect(registerForm().getByLabelText("Author")).toHaveProperty("value", "");
});

test.each([
  {
    scenario: "a non-numeric year is sent as typed",
    year: "19x5",
    expected: { publishedYear: "19x5" },
  },
  { scenario: "a blank year and no genre are omitted", year: "   ", expected: {} },
])(
  "given $scenario, when staff register the book, then the details are sent accordingly",
  async ({ year, expected }) => {
    const requests: unknown[] = [];
    server.use(
      listAssetsHandler(),
      registerAssetHandler({ asset: buildAsset(), onRequest: (body) => requests.push(body) }),
    );
    render(<App />);
    const user = userEvent.setup();
    await user.type(registerForm().getByLabelText("Title"), "Dune");
    await user.type(registerForm().getByLabelText("Year"), year);

    await user.click(screen.getByRole("button", { name: "Register book" }));

    await waitFor(() => expect(requests).toHaveLength(1));
    expect(requests).toEqual([{ title: "Dune", author: "", isbn: "", ...expected }]);
  },
);

test.each([
  {
    scenario: "the service answers 500",
    handler: http.post("/assets", () =>
      HttpResponse.json({ error: "InternalError" }, { status: 500 }),
    ),
  },
  { scenario: "the network fails", handler: http.post("/assets", () => HttpResponse.error()) },
])(
  "given $scenario, when staff register the book, then no success message shows and the input is kept",
  async ({ handler }) => {
    server.use(listAssetsHandler(), handler);
    render(<App />);
    const user = await fillDune();

    await user.click(screen.getByRole("button", { name: "Register book" }));

    await waitFor(() =>
      expect(screen.getByRole("button", { name: "Register book" })).toBeDefined(),
    );
    expect(registrationStatus().textContent).toBe("");
    expect(registerForm().getByLabelText("Title")).toHaveProperty("value", "Dune");
  },
);

test("given the page is open, when staff press Tab, then focus moves through the fields in order to the submit button", async () => {
  server.use(listAssetsHandler());
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = userEvent.setup();

  const expectedOrder: HTMLElement[] = [
    registerForm().getByLabelText("Title"),
    registerForm().getByLabelText("Author"),
    registerForm().getByLabelText("ISBN"),
    registerForm().getByLabelText("Year"),
    registerForm().getByLabelText("Genre (optional)"),
    registerForm().getByRole("button", { name: "Register book" }),
  ];
  const focusOrder: (Element | null)[] = [];
  for (const _step of expectedOrder) {
    await user.tab();
    focusOrder.push(document.activeElement);
  }

  expect(focusOrder).toEqual(expectedOrder);
});

test("given the register form, when staff look at it, then Title, Author, ISBN and Year are required and Genre is optional", () => {
  server.use(listAssetsHandler());
  render(<App />);

  const requiredLabels = ["Title", "Author", "ISBN", "Year", "Genre (optional)"].filter((label) =>
    registerForm().getByLabelText(label).hasAttribute("required"),
  );

  expect(requiredLabels).toEqual(["Title", "Author", "ISBN", "Year"]);
});

test("given a filled form, when staff press Enter in Year, then the book is registered", async () => {
  const requests: unknown[] = [];
  server.use(
    listAssetsHandler(),
    registerAssetHandler({ asset: buildAsset(), onRequest: (body) => requests.push(body) }),
  );
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = userEvent.setup();

  await user.type(registerForm().getByLabelText("Year"), "1965{Enter}");

  await waitFor(() => expect(requests).toHaveLength(1));
});

test("given the page is open, when staff open Genre, then No genre comes first followed by every genre's display label", () => {
  server.use(listAssetsRawHandler({ status: 200, body: { items: [] } }));
  render(<App />);

  const options = within(registerForm().getByLabelText("Genre (optional)"))
    .getAllByRole("option")
    .map((option) => option.textContent);

  expect(options).toEqual(["No genre", ...GenreSchema.options.map((genre) => GENRE_LABELS[genre])]);
});

test("given a book was registered, when the list reloads, then the page has no accessibility violations", async () => {
  const { reloadGate } = useRegistrationFlow();
  const { container } = render(<App />);
  await screen.findByText("No books registered yet.");
  const user = await fillDune();
  await user.click(screen.getByRole("button", { name: "Register book" }));
  reloadGate.open();
  await screen.findByRole("row", { name: /Dune/ });

  expect(await axe(container)).toHaveNoViolations();
});

const registerForm = () => within(screen.getByRole("region", { name: "Register a book" }));

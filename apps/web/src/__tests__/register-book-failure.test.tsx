import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { http, HttpResponse } from "msw";
import { axe } from "vitest-axe";
import { App } from "../app.tsx";
import { buildAsset } from "../test-support/asset-factories.ts";
import { createGate } from "../test-support/create-gate.ts";
import {
  listAssetsHandler,
  registerAssetHandler,
  listAssetsRawHandler,
  registerAssetRawHandler,
} from "../test-support/asset-handlers.ts";
import { server } from "../test-support/msw-server.ts";

const RETRY_MESSAGE = "Could not register the book. Check the service is running and try again.";

const LIST_ERROR_MESSAGE = "Could not load books. Check the service is running and try again.";

const FAILURES: readonly Failure[] = [
  { name: "cannot be reached", handler: http.post("/assets", () => HttpResponse.error()) },
  {
    name: "responds with a server error",
    handler: registerAssetRawHandler({ status: 500, body: { error: "InternalError" } }),
  },
  {
    name: "responds with a status the page does not expect",
    handler: registerAssetRawHandler({ status: 413, body: { error: "PayloadTooLarge" } }),
  },
  {
    name: "responds with a body the page cannot read",
    handler: registerAssetRawHandler({ status: 201, body: { unexpected: true } }),
  },
];

const renderPageWithFailure = async (handler: Failure["handler"]): Promise<User> => {
  server.use(listAssetsHandler(), handler);
  render(<App />);
  await screen.findByText("No books registered yet.");
  const user = userEvent.setup();
  await user.type(registerForm().getByLabelText("Title"), "Dune");
  await user.type(registerForm().getByLabelText("Author"), "Frank Herbert");
  await user.type(registerForm().getByLabelText("ISBN"), "978-0-306-40615-7");
  await user.type(registerForm().getByLabelText("Year"), "1965");
  await user.click(screen.getByRole("button", { name: "Register book" }));
  return user;
};

const fieldValue = (label: string): string => {
  const field = registerForm().getByLabelText(label);
  return field instanceof HTMLInputElement ? field.value : "";
};

test.each(FAILURES)(
  "given the service $name, when staff register a book, then it asks them to retry and keeps their input",
  async ({ handler }) => {
    await renderPageWithFailure(handler);

    expect(await screen.findByText(RETRY_MESSAGE)).toBeDefined();
    expect(within(screen.getByRole("alert")).getByText(RETRY_MESSAGE)).toBeDefined();
    expect([
      fieldValue("Title"),
      fieldValue("Author"),
      fieldValue("ISBN"),
      fieldValue("Year"),
    ]).toEqual(["Dune", "Frank Herbert", "978-0-306-40615-7", "1965"]);
    expect(
      screen.getByRole("button", { name: "Register book" }).getAttribute("aria-disabled"),
    ).toBe("false");
  },
);

test("given the retry message shows, when a resubmit succeeds, then the retry message clears", async () => {
  const user = await renderPageWithFailure(
    registerAssetRawHandler({ status: 500, body: { error: "InternalError" } }),
  );
  await screen.findByText(RETRY_MESSAGE);
  server.use(
    listAssetsHandler({ items: [buildAsset()] }),
    registerAssetHandler({ asset: buildAsset(), onRequest: () => undefined }),
  );

  await user.click(screen.getByRole("button", { name: "Register book" }));

  expect(await screen.findByText('"Dune" registered.')).toBeDefined();
  expect(screen.queryByText(RETRY_MESSAGE)).toBeNull();
});

test("given the retry message shows, when staff resubmit, then the retry message clears at once", async () => {
  const user = await renderPageWithFailure(
    registerAssetRawHandler({ status: 500, body: { error: "InternalError" } }),
  );
  await screen.findByText(RETRY_MESSAGE);
  const gate = createGate();
  server.use(
    listAssetsHandler({ items: [buildAsset()] }),
    http.post("/assets", async () => {
      await gate.wait;
      return HttpResponse.json(buildAsset(), { status: 201 });
    }),
  );

  await user.click(screen.getByRole("button", { name: "Register book" }));

  expect(screen.queryByText(RETRY_MESSAGE)).toBeNull();
  gate.open();
  await screen.findByText('"Dune" registered.');
});

test("given the list cannot be refreshed, when staff register a book, then the registration is announced and staff are asked to retry", async () => {
  server.use(listAssetsHandler());
  render(<App />);
  await screen.findByText("No books registered yet.");
  server.use(
    registerAssetHandler({ asset: buildAsset(), onRequest: () => undefined }),
    listAssetsRawHandler({ status: 500, body: { error: "InternalError" } }),
  );
  const user = userEvent.setup();
  await user.type(registerForm().getByLabelText("Title"), "Dune");
  await user.type(registerForm().getByLabelText("Author"), "Frank Herbert");
  await user.type(registerForm().getByLabelText("ISBN"), "978-0-306-40615-7");
  await user.type(registerForm().getByLabelText("Year"), "1965");

  await user.click(screen.getByRole("button", { name: "Register book" }));

  expect(await screen.findByText(LIST_ERROR_MESSAGE)).toBeDefined();
  expect(screen.getByText('"Dune" registered.')).toBeDefined();
  expect(screen.getByRole("button", { name: "Retry" })).toBeDefined();
});

type User = ReturnType<typeof userEvent.setup>;

interface Failure {
  readonly name: string;
  readonly handler: ReturnType<typeof registerAssetRawHandler>;
}

const registerForm = () => within(screen.getByRole("region", { name: "Register a book" }));

test("given the retry message is shown, when the page is shown, then it has no accessibility violations", async () => {
  await renderPageWithFailure(
    registerAssetRawHandler({ status: 500, body: { error: "InternalError" } }),
  );
  await screen.findByText(RETRY_MESSAGE);

  expect(await axe(document.body)).toHaveNoViolations();
});

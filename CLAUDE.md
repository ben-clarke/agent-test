# Development Guidelines for Claude

## Quick Reference

**Key Principles:**

- Every change ships with behaviour tests; 100% coverage
- Test behaviour, not implementation
- No `any` types or type assertions
- Immutable data only
- Small, pure functions
- TypeScript strict mode always
- Use real schemas/types in tests, never redefine them
- Types/interfaces should be at the bottom of the file
- Constants should be at the bottom of the file
- The main functions should be at the top of the file and any helper functions under them

**Preferred Tools:**

- **Language**: TypeScript (strict mode)
- **Testing**: Vitest + React Testing Library
- **State Management**: Prefer immutable patterns

## Review guidelines
- Follow the Key Principles
- Follow the Code Style
- Check for Anti-patterns to Avoid
- Check Naming Conventions

Plus the recommendations in this file.

## Agent Workflow

- Do not introduce new tooling/package managers without explicit request
- Do not commit secrets, tokens, or credentials
- Ask clarifying questions when requirements are ambiguous
- Explain trade-offs and rationale for significant design decisions
- `@aws-sdk` packages should be installed as `devDependencies`
- Work in small increments that maintain a working state
- Do not remove TODO lines unless you have addressed them. You do NOT have to address them unless prompted

## Coding Standards

### Key Principles

- Always declare the type of each variable and function (parameters and return value) - leverage inference only where the type is obvious
- Create necessary types for domain concepts, inputs, and outputs
- No `any` types - use `unknown` if type is truly unknown
- No type assertions (`as T`) unless absolutely necessary with justification
- No `@ts-ignore` or `@ts-expect-error` without explanation
- TypeScript strict mode always (`strict`, `noUnusedLocals`, `noUnusedParameters`, `noImplicitReturns`, `noFallthroughCasesInSwitch`)
- Favour the latest ES and Node.js features
- Leverage utility types (`Pick`, `Omit`, `Partial`, `Required`, etc.)
- Use branded types for domain-specific type safety (e.g., `type UserId = string & { readonly brand: unique symbol }`)
- Avoid magic numbers - define constants
- Fix errors as encountered. If you can't finish code, add `TODO:` comments
- Main/public functions at the top, helper functions below them
- Types/interfaces at the bottom of the file
- Constants at the bottom of the file
  
### Code Style
- Use `const` - avoid `let` unless reassignment is truly necessary
- Arrow functions preferred, always use parentheses around parameters
- Use `async`/`await` over Promise chaining (`.then`/`.catch`) when possible
- Array methods (`map`, `filter`, `reduce`) over imperative loops
- Use default parameter values instead of checking for null or undefined
- Use options objects for functions with multiple or optional parameters (RO-RO: Receive an Object, Return an Object)
- Use an object to return complex results - declare types for both input arguments and output
- Positional params acceptable for single-param pure functions and standard patterns (`map`, `filter`)
- Logging via `import logger from "@sme-lending/logger"`, following [Logging Guidelines](docs/guidelines/LOGGING_GUIDELINES.md) for what to log, at which level, and in what shape
- Self-documenting code - comments only where business intent is non-obvious, uncommon libraries are used, or the operation is not clear from the code
- Comments should describe purpose, not effect
- If a Zod schema exist, derive the type from the validator and don't declare a new type

### Date and Currency Formatting

- Before adding or changing date or currency formatting, search the relevant app and shared packages for existing formatters and read their options and behaviour.
- Reuse an existing formatter whenever it can meet the requirement, including through its options for locale, time zone, precision, and missing-value text. Avoid duplicating formatting with `Intl`, `toLocaleString`, manual string assembly, or a new local formatter when a shared helper already supports the required output.
- In `ui-dashboard`, start with `app/utils/formatters/date-formatters.ts` and `app/utils/formatters/money-formatters.ts`. Also check `@sme-lending/utils` for shared date utilities. Other workspaces must use helpers available through their own dependencies rather than importing from another app.
- A small, named wrapper may apply domain-specific options or fallback text to a shared formatter; keep the formatting implementation in the shared helper.
- Preserve the required output when reusing helpers: check date-only versus timestamp semantics, time zones, currency symbols, decimal precision, and null or undefined values.
- If no existing helper can meet the requirement, extend the appropriate shared formatter when the behaviour is reusable. Add a local implementation only for a distinct requirement and explain why existing helpers are unsuitable in the handoff or PR.

### Anti-patterns to Avoid
- Avoid mutating existing arrays/objects; prefer immutable updates
- Avoid deeply nested conditionals; prefer early returns
- Avoid large multi-responsibility functions; compose small single-purpose functions

### Error Handling

- Read a dependency's implementation and error contract before adding caller-side error handling.
- When a dependency handles an expected failure, follow its error contract. Only branch on its result when the business operation requires it; do not add redundant `try/catch` blocks or duplicate logging.
- Add a catch only for a documented exception that the caller can meaningfully recover from or translate at its boundary.
- Audit delivery is best effort. Always call `await addAuditEvent(...)` without inspecting its result. Never branch on audit success, block or fail a business operation, change its response or persisted state, or add caller-side catches or logging for audit delivery failures. The audit client owns delivery error handling and logging.
- Keep test doubles consistent with the dependency's error contract. For example, simulate audit delivery failure with `{ success: false }`, not a rejected `addAuditEvent` promise, and verify that the business operation still completes normally.

### React Component Guidance
- Before making any React component architecture or composition change, read [React Component Guidelines](docs/guidelines/REACT_COMPONENT_GUIDELINES.md) in the current repository and follow it.
- During implementation and before handing off any React change, inspect each changed component for independently meaningful UI sections, table cells, repeated items, and conditional rendering branches. Extract those responsibilities into focused components in separate files, grouped by purpose where useful. One component per file alone does not satisfy this requirement: a single component can still do too much.
- Keep parent components focused on composing their children. Choose extraction boundaries by responsibility, not line count; do not create components for individual tags that have no independent purpose. Explain any deliberate decision to retain multiple responsibilities in the handoff.
- For any React change, explicitly confirm in the handoff whether the guideline document was read, how the component structure follows it, and any deliberate deviations with rationale.

### Remix Route Guidance
- Before making any Remix route architecture or route-handler structure change, read [Remix Guidelines](docs/guidelines/REMIX_GUIDELINES.md) in the current repository and follow them.
- When adding or changing a loader, action, or server utility, read [Logging Guidelines](docs/guidelines/LOGGING_GUIDELINES.md) and log the outcomes, rejections, failures, and fallbacks it lists.

## Testing Standards

### Testing Conventions
- Vitest unit and integration-style tests must follow [Unit Testing Guidelines](docs/guidelines/UNIT_TESTING_GUIDELINES.md) for structure, mocking, React component tests, and execution detail.
- Write acceptance tests for each module; follow the Given-When-Then convention for acceptance tests
- Test behaviour through the public API - internals are invisible to tests
- 100% coverage expected, driven by business behaviour, not implementation details
- If Terraform files are touched, run the relevant `terraform fmt`/validation path before handoff or state why it could not be run

### Playwright Standards
- Playwright tests are not mandatory for every change, but coverage decisions must be explicit for Jira ticket work and user-visible React/UI changes.
- For every Jira ticket or user-visible React/UI change, explicitly evaluate whether Playwright coverage is needed during planning.
- Add or update Playwright coverage for core user journeys and representative happy and sad paths when the change affects them.
- Add or update Playwright tests when changing navigation/routing, authentication/session, permissions/access, multi-step forms, or cross-service UI journeys unless there is a clear reason not to.
- Cover behaviour with unit/integration tests only when E2E coverage would be brittle, disproportionately expensive, or difficult to implement with confidence.
- If a user-visible change does not include Playwright updates, include a short rationale in the handoff or PR.
- In the handoff or PR, include either `Playwright: added/updated <spec path>` with the covered scenario or `Playwright: not added` with the rationale.
- Update an existing journey spec when behaviour changes; add a new spec only when introducing a genuinely new journey or boundary.
- For Playwright structure and execution detail, follow [Playwright Testing Guidelines](docs/guidelines/PLAYWRIGHT_TESTING_GUIDELINES.md).
- When running Playwright tests locally, use the `run-playwright-tests` skill rather than invoking `play:test` directly — it starts the target app (via the `start-app` skill), which checks that required infra is running and stops if it isn't, so tests aren't run against a dev server that isn't up.

---

### Naming Conventions

- **Functions**: `camelCase`, verb-based (`calculateTotal`, `validatePayment`)
- **Types/Classes**: `PascalCase` (`PaymentRequest`, `UserProfile`)
- **Constants**: `UPPER_SNAKE_CASE`
- **Environment variables**: `UPPERCASE`
- **Files**: `kebab-case.ts`
- **Test files**: `*.test.ts` or `*.spec.ts`
- **Booleans**: use `isX`, `hasX`, `canX`
- **Void functions**: use `executeX`, `saveX`, etc.
- Use complete words, not abbreviations (except standard abbreviations like `API`, `URL`, etc. and well-known shorthand: `i/j`, `err`, `ctx`, `req/res/next`)

## Testing Principles

### Behaviour-Driven Testing

- **No "unit tests"** - this term is not helpful. Tests should verify expected behaviour, treating implementation as a black box
- Test through the public API exclusively - internals should be invisible to tests
- No 1:1 mapping between test files and implementation files
- Tests that examine internal implementation details are wasteful and should be avoided
- **Coverage targets**: 100% coverage should be expected at all times, but these tests must ALWAYS be based on business behaviour, not implementation details
- Tests must document expected business behaviour
- vitest imports are not required in the test files
- Validation and other implementation-detail code reaches 100% coverage indirectly: write tests against the public API covering every business outcome (e.g. rejected for invalid input, processed successfully) rather than importing and testing internal validator functions directly

### Testing Tools

- **Vitest** for testing frameworks
- **React Testing Library** for React components
- **MSW (Mock Service Worker)** for API mocking when needed
- **Organize tests** place all test files in a `__tests__` directory located within the same directory as the corresponding entry point file.
- **Test declaration style** always use the `test` function to define test cases. Avoid using `it`.
- All test code must follow the same TypeScript strict mode rules as production code

### Test Organization

```
src/
  features/
    payment/
      __tests__
        payment-processor.test.ts // The validator is an implementation detail. Validation is fully covered, but by testing the expected business behaviour, treating the validation code itself as an implementation detail
      payment-processor.ts
      payment-validator.ts
```

### Test Data Pattern

Use factory functions with optional overrides for test data.

Key principles:

- Always return complete objects with sensible defaults
- Accept optional `Partial<T>` overrides
- Build incrementally - extract nested object factories as needed
- Compose factories for complex objects
- Consider using a test data builder pattern for very complex objects
- NEVER EVER nest assertions inside if statements

## TypeScript Guidelines

### Strict Mode Requirements

```json
// tsconfig.json
{
  "compilerOptions": {
    "strict": true,
    "noImplicitAny": true,
    "strictNullChecks": true,
    "strictFunctionTypes": true,
    "strictBindCallApply": true,
    "strictPropertyInitialization": true,
    "noImplicitThis": true,
    "alwaysStrict": true,
    "noUnusedLocals": true,
    "noUnusedParameters": true,
    "noImplicitReturns": true,
    "noFallthroughCasesInSwitch": true
  }
}
```

- **No `any`** - ever. Use `unknown` if type is truly unknown
- **No type assertions** (`as SomeType`) unless absolutely necessary with clear justification
- **No `@ts-ignore`** or `@ts-expect-error` without explicit explanation
- These rules apply to test code as well as production code

### Type Definitions

- Use explicit typing where it aids clarity, but leverage inference where appropriate
- Utilize utility types effectively (`Pick`, `Omit`, `Partial`, `Required`, etc.)
- Create domain-specific types (e.g., `UserId`, `PaymentId`) for type safety
- Use Zod or any other [Standard Schema](https://standardschema.dev/) compliant schema library to create types, by creating schemas first

#### Schema-First Development with Zod

Always define your schemas first, then derive types from them, and compose schemas (e.g. `BaseEntitySchema.extend(...)`) for complex domains.

#### Schema Usage in Tests

**CRITICAL**: Tests must use real schemas and types from the main project, not redefine their own — import them (e.g. `import { ProjectSchema, type Project } from "@sme-lending/schemas"`) rather than declaring a local copy.

**Why this matters:**

- **Type Safety**: Ensures tests use the same types as production code
- **Consistency**: Changes to schemas automatically propagate to tests
- **Maintainability**: Single source of truth for data structures
- **Prevents Drift**: Tests can't accidentally diverge from real schemas

**Implementation:**

- All domain schemas should be exported from a shared schema package or module
- Test files should import schemas from the shared location
- If a schema isn't exported yet, add it to the exports rather than duplicating it
- Mock data factories should use the real types derived from real schemas

## Code Style

### Functional Programming

I follow a "functional light" approach:

- **No data mutation** - work with immutable data structures
- **Pure functions** wherever possible
- **Composition** as the primary mechanism for code reuse
- Avoid heavy FP abstractions (no need for complex monads or pipe/compose patterns) unless there is a clear advantage to using them
- Use array methods (`map`, `filter`, `reduce`) over imperative loops
- Heavy FP abstractions (Task/IO, Result/Either) are appropriate for complex async flows or error-handling chains that benefit from them — otherwise prefer plain composition

### Code Structure

- **No nested if/else statements** - use early returns, guard clauses, or composition
- **Avoid deep nesting** in general (max 2 levels)
- Keep functions small and focused on a single responsibility
- Prefer flat, readable code over clever abstractions

### Comments

Code should be self-documenting through clear naming and structure — extract well-named constants and functions instead of commenting what a branch does. Comments are allowed only where:

- The intent is not obvious from the code itself
- A business reason or decision drives the code that would not be immediately obvious to a reader (e.g. a regulatory rule, a deliberate workaround, or a non-obvious edge case)

Comments should explain *why*, never restate *what* the code does.

### Prefer Options Objects

Use options objects for function parameters as the default pattern. Only use positional parameters when there's a clear, compelling reason (e.g., single-parameter pure functions, well-established conventions like `map((item) => item.value)`).

**Guidelines for options objects:**

- Default to options objects unless there's a specific reason not to
- Always use for functions with optional parameters
- Destructure options at the start of the function for clarity
- Provide sensible defaults using destructuring
- Keep related options grouped (e.g., all shipping options together)
- Consider breaking very large options objects into nested groups

**When positional parameters are acceptable:**

- Single-parameter pure functions
- Well-established functional patterns (map, filter, reduce callbacks)
- Mathematical operations where order is conventional

## Development Workflow

### Testing Workflow

Tests may be written before or after the production code, but every change MUST ship with them:

- Tests are included in the same commit as the code they cover
- Every business outcome is covered, including sad paths, keeping coverage at 100%
- Bug fixes include a test that reproduces the bug
- Before handoff, confirm each new test fails when the behaviour it covers is broken — a test that cannot fail proves nothing
- Do not add functionality "while you're there" without tests covering it

### Refactoring

Evaluating refactoring opportunities is not optional. Once tests pass and the work is committed, assess whether the code can be improved. However, only refactor if there's clear value - if the code is already clean and expresses intent well, move on.

#### What is Refactoring?

Refactoring means changing the internal structure of code without changing its external behaviour. The public API remains unchanged, all tests continue to pass, but the code becomes cleaner, more maintainable, or more efficient. Remember: only refactor when it genuinely improves the code - not all code needs refactoring.

#### When to Refactor

- **Always assess once tests pass**: Before moving on, evaluate if refactoring would add value
- **When you see duplication**: But understand what duplication really means (see DRY below)
- **When names could be clearer**: Variable names, function names, or type names that don't clearly express intent
- **When structure could be simpler**: Complex conditional logic, deeply nested code, or long functions
- **When patterns emerge**: After implementing several similar features, useful abstractions may become apparent

**Remember**: Not all code needs refactoring. If the code is already clean, expressive, and well-structured, commit and move on. Refactoring should improve the code - don't change things just for the sake of change.

#### Refactoring Guidelines

##### 1. Commit Before Refactoring

Always commit your working code before starting any refactoring. This gives you a safe point to return to.

##### 2. Look for Useful Abstractions Based on Semantic Meaning

Create abstractions only when code shares the same semantic meaning and purpose. Don't abstract based on structural similarity alone - **duplicate code is far cheaper than the wrong abstraction**.

**Questions to ask before abstracting:**

- Do these code blocks represent the same concept or different concepts that happen to look similar?
- If the business rules for one change, should the others change too?
- Would a developer reading this abstraction understand why these things are grouped together?
- Am I abstracting based on what the code IS (structure) or what it MEANS (semantics)?

**Remember**: It's much easier to create an abstraction later when the semantic relationship becomes clear than to undo a bad abstraction that couples unrelated concepts.

##### 3. Understanding DRY - It's About Knowledge, Not Code

DRY (Don't Repeat Yourself) is about not duplicating **knowledge** in the system, not about eliminating all code that looks similar. Code that looks structurally similar but represents different business concepts (e.g. two validators that happen to share a numeric range check today) is not a DRY violation — abstracting it couples rules that should be free to evolve independently. Only extract a shared function when the same piece of knowledge is genuinely duplicated across call sites.

##### 4. Maintain External APIs During Refactoring

Refactoring must never break existing consumers of your code — the public API (exported function signatures) stays stable while internals are reorganised into smaller, well-named private helpers.

##### 5. Verify and Commit After Refactoring

**CRITICAL**: After every refactoring:

1. Run all tests - they must pass without modification
2. Run tests from the specific `app` or `package` directory
3. Run tests using `pnpm`
4. Use the command `pnpm test run` to ensure the tests are not run in watch mode
5. Run static analysis (linting, type checking) - must pass
6. Commit the refactoring separately from feature changes

#### Refactoring Checklist

Before considering refactoring complete, verify:

- [ ] The refactoring actually improves the code (if not, don't refactor)
- [ ] All tests still pass without modification
- [ ] All static analysis tools pass (linting, type checking)
- [ ] No new public APIs were added (only internal ones)
- [ ] Code is more readable than before
- [ ] Any duplication removed was duplication of knowledge, not just code
- [ ] No speculative abstractions were created
- [ ] The refactoring is committed separately from feature changes

### Commit Guidelines

- Each commit should represent a complete, working change
- Use present tense ("Add feature" not "Added feature")
- Use imperative mood ("Move cursor to..." not "Moves cursor to...")
- First line should be 50 chars or less
- Reference issues and pull requests liberally
- Consider starting commit message with applicable emoji
- Include test changes with feature changes in the same commit

### Pull Request Standards

- Every PR must have all tests passing
- All linting and quality checks must pass
- Work in small increments that maintain a working state
- PRs should be focused on a single feature or fix
- Include description of the behaviour change, not implementation details

## Working with Claude

### Expectations

When working with my code:

1. **No behaviour change without tests covering it** - coverage stays at 100%
2. **Think deeply** before making any edits
3. **Understand the full context** of the code and requirements
4. **Ask clarifying questions** when requirements are ambiguous
5. **Think from first principles** - don't make assumptions
6. **Assess refactoring once tests pass** - Look for opportunities to improve code structure, but only refactor if it adds value
7. **Keep project docs current** - update them whenever you introduce meaningful changes

### Code Changes

When suggesting or making changes:

- **Include tests with every change** - covering every business outcome
- After making tests pass, always assess refactoring opportunities (but only refactor if it adds value)
- After refactoring, verify all tests and static analysis pass, then commit
- Respect the existing patterns and conventions
- Maintain test coverage for all behaviour changes
- Keep changes small and incremental
- Ensure all TypeScript strict mode requirements are met
- Provide rationale for significant design decisions

### Communication

- Be explicit about trade-offs in different approaches
- Explain the reasoning behind significant design decisions
- Flag any deviations from these guidelines with justification
- Suggest improvements that align with these principles
- When unsure, ask for clarification rather than assuming

### Response Style

Unless asked to behave otherwise, always give concise responses and sacrifice grammar for the sake of concision. Ask clarifying questions when needed and offer your best guess at available interpretations/answers for those questions when possible.

These rules apply to chat replies. PR descriptions, Jira tickets, specs, commit messages and handoffs a skill requires stay in full sentences and follow their own formats.

#### Be RUTHLESSLY concise

Default to a few sentences. If the answer is "yes", say "yes" and stop.

- **Answer the question asked. Nothing else.** No adjacent findings, no "while I was looking I noticed", no caveats I didn't ask for. Sit on it until I ask.
- **One thing at a time.** Never hand me a numbered list of 3+ considerations, options, or trade-offs unless I asked for options. Pick one, recommend it, move on.
- **No teaching.** Skip the mechanism, the background, the "why this matters". State the conclusion. I'll ask why if I care.
- **No tables, no headers, no bold-label paragraphs** for a simple answer. Prose or a couple of lines.
- **Cut every parenthetical, every "worth noting", every "the real finding is".**
- Corrections: one sentence, no post-mortem.

Length is the tell: if a reply is over ~10 lines and I didn't ask for depth, it's wrong. Detail I have to skim to find the answer is worse than no answer.

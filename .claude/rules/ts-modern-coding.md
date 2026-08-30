# TypeScript / JavaScript Modern Coding Standards

## General Principles
- Prefer explicit and readable code over clever or overly concise constructs.
- Favor immutability where practical (`const`, `Readonly`, `as const`).
- Keep functions small and focused on a single responsibility.
- Use early returns to reduce nesting.
- Avoid magic numbers and strings; extract named constants when the meaning is not immediately clear.

## TypeScript Specific
- Enable and respect strict mode (`strict: true`).
- Avoid `any`. Prefer `unknown` combined with type guards or proper type narrowing.
- Prefer `interface` for object shapes that may be extended; use `type` for unions, intersections, and mapped types.
- Use discriminated unions for complex state modeling.
- Prefer `satisfies` operator when you need to check a value against a type while preserving the narrower inferred type.
- Use `Readonly` and `ReadonlyArray` for data that should not be mutated.
- Prefer named exports over default exports for better refactoring and tree-shaking.

## Modern JavaScript / TypeScript Features
- Prefer optional chaining (`?.`) and nullish coalescing (`??`) over verbose null checks.
- Use private class fields (`#field`) when true privacy is needed.
- Prefer `for...of` or array methods (`map`, `filter`, `reduce`, `flatMap`) over traditional `for` loops when clarity is not sacrificed.
- Use top-level `await` in ES modules when appropriate.

## Error Handling
- Prefer throwing or returning `Result`-like patterns over silent failures.
- Use custom error classes when the error type carries meaningful information.
- Validate inputs at system boundaries.

## Async & Concurrency
- Prefer `async/await` over raw Promise chains.
- Avoid floating promises; always handle or explicitly void them.
- Use `AbortController` for cancellable operations when relevant.
AGENTS.md
Engineering principles

Write code that is easy to understand, maintain, test, reuse, and extend.

Optimize for long-term maintainability, not short-term implementation speed.

1. Design and architecture
    - Apply separation of concerns: keep business logic, presentation, infrastructure, and orchestration distinct.
    - Give each module, class, and function a clear, cohesive responsibility.
    - Keep dependencies explicit and minimize coupling between modules and domains.
    - Keep business rules independent from implementation details whenever practical.
    - Follow the existing architecture and conventions. Improve them incrementally rather than imposing new patterns.
    - Apply SOLID, DRY, KISS, and YAGNI pragmatically. Never introduce abstractions, layers, interfaces, or design patterns without a concrete benefit.
    - Prefer composition over inheritance and explicit contracts over implicit behavior.
2. Readability and maintainability
    - Optimize for the next developer reading the code.
    - Prefer simple, explicit, self-explanatory code over clever or overly generic solutions.
    - Use meaningful names that communicate intent.
    - Keep functions and modules focused. Avoid unnecessary complexity, deep nesting, and hidden side effects.
    - Avoid duplicated business logic, god modules, circular dependencies, and unrelated responsibilities.
    - Make changes easy to understand and localize. A change in one domain should not unnecessarily affect unrelated domains.
3. Reusability and extensibility
    - Extract shared logic only when there is a genuine common responsibility.
    - Avoid premature generalization and speculative flexibility.
    - Design clear module boundaries and stable interfaces.
    - Prefer reusable domain logic over duplicated feature-specific implementations.
4. Documentation and typing
    - Prefer self-documenting code.
    - Use JSDoc only when it adds meaningful context: public contracts, non-obvious behavior, complex types, side effects, or business rules.
    - Do not document obvious implementations or repeat information already expressed by types and names.
    - Prefer strong, precise types over any or unnecessary type assertions.
5. The Boy Scout Rule
Leave touched code better than you found it.
    - Improve nearby readability, naming, cohesion, and duplication when relevant.
    - Remove dead code, obsolete comments, and unnecessary complexity.
    - Keep improvements proportional to the task.
    - Never use an unrelated change as an excuse for a large refactoring.
6. Testing and reliability
    - Preserve existing behavior unless explicitly asked to change it.
    - Test observable behavior and important business rules.
    - Keep business logic independently testable whenever practical.
    - Handle errors explicitly. Never silently swallow failures.
    - Run relevant tests, type checks, and linting when available.
    - Never claim a check passed if it was not executed.
7. Working discipline
    - Understand the existing implementation before changing it.
    - Inspect surrounding code and dependencies when necessary.
    - Keep changes focused on the requested scope.
    - Never overwrite or revert unrelated user changes.
    - Do not introduce dependencies without a clear justification.
    - Review the final diff for unintended changes and unnecessary complexity.
8. Golden rule
    - Choose the simplest design that makes responsibilities clear, dependencies manageable, and future changes localized.
    - Do not optimize for architectural sophistication. Optimize for sustainable simplicity.
9. Pull requests
    - Before opening a pull request or writing its description, read and follow `docs/PULL_REQUESTS.md`: description template, autonomous agent review, and the maintainer as sole merger.

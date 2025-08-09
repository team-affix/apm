# Why Agda?

APM is Agda-first by design. Agda’s language and module model align naturally with APM’s goals.

## Modules are namespaces

- In Agda, modules double as namespaces; there is no separate global namespace feature.
- This makes name conflicts tractable: a project has one top-level module (its root folder name), and APM enforces a single package per top-level name within a project.
- Name-based overrides become straightforward and safe to reason about (see [dependencies](../dependencies.md)).

## Contrast: global namespaces in other systems

- In systems with global namespaces (e.g., Lean), multiple modules can contribute to the same global namespace.
- That increases the odds of symbol collisions and makes cross-project name arbitration harder, particularly in decentralized settings.
- APM’s rule "one package per top-level module name in a project" maps cleanly onto Agda’s model.

## Simple, approachable syntax

- Agda’s syntax is relatively simple to learn compared to many proof assistants.
- This lowers the barrier to expressing nuanced, composable ideas as formal artifacts.

## Practical fit for APM

- Vetting runs Agda directly to typecheck packages (no extra wrapper semantics needed).
- The `.agda-lib` layout and single-root design mirror APM’s dependency and sandboxing model.

For related details:

- [Concepts](../concepts.md)
- [Dependencies](../dependencies.md)
- [Design translations](design.md)

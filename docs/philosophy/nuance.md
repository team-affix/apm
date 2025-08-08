# Nuance and shelling points

Human discourse often clusters around extreme, salient positions (Schelling points), because it’s painful to hold beliefs “in the middle.” APM’s formal medium and community incentives can increase nuance:

- Precision through symbols: logic symbols and types force clarity about definitions, scopes, and assumptions
- Compositional beliefs: small, targeted modules make it easy to express nuanced positions and their exact dependencies
- Incentives via reuse: precise components that capture subtle distinctions are more reusable, encouraging refinement rather than polarization
- Local consistency checks: typechecking eliminates ambiguous phrasing and rewards carefully delimited claims

Practically:

- Break ideas into modules with explicit interfaces
- Record assumptions as dependencies rather than implicit context
- Iterate toward the minimal claim that typechecks under your intended assumptions

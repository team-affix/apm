# Deterministic, content‑addressed IDs

APM identifies packages by `name@<sha256>` where the hash is over the entire package file. The same bytes produce the same ID everywhere.

Why this matters in a decentralized system:

- No configuration drift: two registries storing the same package file must agree on the ID. There is no room for local configuration or policy to change the identifier.
- Mirror integrity: pull/push works reliably across independent registries because identity is a function of content, not naming conventions.
- Reproducibility: an ID references an exact byte sequence. If two IDs match, the packages are identical.
- Namesquatting resistance: names are not used to identify artifacts globally—only as the human‑readable prefix of a content hash. This avoids cross‑registry name conflicts.

Contrast with name/version schemes (e.g., semantic versioning):

- Centralization pressure: coordinating names and versions across registries requires shared governance or trust. Divergence is easy and common.
- Hijackability: different hosts could assign different names/versions to the same bytes (or the same name/version to different bytes), breaking sync.
- Synchronization friction: namesquatting and policy discrepancies complicate mirroring.

Real‑world recovery:

- If a registry you used is taken down, you already know the exact IDs you depend on (from `deps.txt` or prior builds).
- You can query or mirror any other registry for those IDs and immediately restore your environment; no renaming or reconciliation is needed.

Example (check which deps the remote registry has, then pull missing ones):

```bash
# list which of your deps the remote registry already has
apm package ls -r backup $(cat deps.txt)

# pull a specific missing ID (repeat as needed)
apm package pull backup SomePkg@<sha256>
```

Verification during vetting:

- When inserting a package into a registry (local or remote), APM recomputes the SHA‑256 from the bytes and checks that the computed `name@sha256` matches the claimed ID.
- If the expected ID is provided and does not match, registration is rejected. This prevents tampering and guarantees that IDs are truthful content addresses.

Net result:

- Deterministic IDs make decentralized pull/push simple and safe. If a package exists on two registries, it has exactly the same ID—treat it as a perfect reproduction.

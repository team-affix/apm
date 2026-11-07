# The DPM protocol

DPM is a protocol, in the way Git is: a data format, an identity rule, dependency-resolution rules, and an HTTP interface. Anyone may implement a client or server. What every implementation shares is defined here. What a server chooses to *accept* is its own policy.

"MUST", "MUST NOT" and "MAY" are used in their usual specification sense.

## 1. Packages

A package is a **name**, a set of **direct dependency IDs**, and an opaque **payload**. Encoding (integers are u32 little-endian):

| Field | Encoding |
|---|---|
| magic | `DPM1` (4 bytes) |
| name | u32 byte length + UTF-8 |
| deps | u32 count, then each ID as u32 byte length + UTF-8 |
| payload | the remaining bytes, opaque |

- Encoding is canonical: dependency IDs MUST be unique and sorted by their UTF-8 bytes. Decoders MUST reject any bytes that are not the canonical encoding of their own contents.
- A name MUST be non-empty and at most 200 bytes, MUST NOT be `.` or `..`, and MUST NOT contain whitespace, control characters, or any of `@ / \ : * ? " < > |`.
- The payload has no meaning at the protocol level. The content's own tools (e.g. a logic checker or a compiler) give it one.

## 2. Identity

A package's ID is `<name>@<lowercase hex SHA-256 of its full encoding>`.

- **Dependencies are referenced by ID only, never by URL or location.** Where a package comes from is never part of any package. Any holder of the bytes is an equally valid source.
- The name is inside the hashed bytes, so it can never change for a given ID. The name in an ID can be read without fetching the package.
- **Hash verification is mandatory.** Implementations MUST check that bytes hash to the expected ID before using them for anything, whether they were received in a push, fetched from a server or read from storage. Bytes that fail MUST be discarded.

## 3. Resolution

Resolving a root (a package, or an unpacked project with a name and deps) yields its dependency tree. The rules define which packages a dependency list actually means, so every implementation MUST apply them identically:

1. A resolved tree contains at most one package per name.
2. **Overrides:** if a package directly depends on a package named N, every package named N deeper in that package's subtree is replaced by it. The root occupies its own name.
3. **Peer conflicts:** if two different packages named N meet in the tree and no common ancestor overrides N, resolution fails.
4. Overridden dependencies are not part of the tree. Implementations SHOULD NOT fetch them, since the name in the ID is enough to know they're overridden.
5. A subtree's contents depend on the overrides above it. A package reached by paths with different overrides MUST be checked under each of them.
6. Resolution fails if any dependency in the tree cannot be obtained.

## 4. HTTP interface

| Request | Success response |
|---|---|
| `GET /health` | `{ "status": "ok" }` |
| `GET /packages` | `{ "ids": [...] }` |
| `GET /packages/:id` | the package's raw bytes (`application/octet-stream`) |
| `POST /packages/has` `{ "ids": [...] }` | `{ "ids": [...] }`, the subset the server holds |
| `POST /packages` `{ "packages": [{ "id", "data" }...], "providers": [url...] }` | `{ "ids": [...], "stored": [...] }` |

In a push, `data` is the base64 package bytes and `id` is the ID the client claims for them. `providers` are registry URLs where the server may look for dependencies.

Errors are JSON `{ "error": "<message>" }`:

| Status | Meaning |
|---|---|
| 400 | malformed request, or a pushed package failed hash verification |
| 404 | no such package or endpoint |
| 413 | request too large |
| 422 | not accepted: the package doesn't resolve, or the server's policy rejects it |
| 500 | server error |

## 5. Server obligations and freedoms

A server:

- MUST hash-verify every pushed package against its claimed ID **before doing anything else** with the push. One failure rejects the whole push with 400.
- MUST only ever serve, under an ID, bytes that hash to that ID.
- MUST treat a push as all-or-nothing: either every package in it is stored, or none is.
- MAY reject any push for any reason, with 422. Acceptance policy is the server's own: the reference server accepts anything that resolves, a logic server also requires logical validity, and an operator may add size limits or allow-lists.
- MAY ignore `providers`, or limit how many it uses.
- Is NOT required to hold the dependencies of the packages it stores.

Clients MUST hash-verify everything they fetch. Servers are untrusted.

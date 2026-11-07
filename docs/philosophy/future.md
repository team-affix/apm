# Future directions

## DLPM: the logic layer

A decentralized logic package manager built on DPM, adding one step between resolve and put: logical validation of the resolved tree. Because DPM already resolves the full tree (with overrides) before anything is stored, DLPM only needs to:

1. unpack the resolved packages to disk (`unpackToDirectory`), and
2. check them with the logic kernel, rejecting the push if the check fails.

DPM exposes this as a `verify` function on `ingest()` and `createServer()`.

Notes for the logic layer:

- Validity belongs to a *resolved tree*, not to a package alone. Overrides swap dependencies, so a package checked against one `C` must be re-checked when a dependent overrides `C`.
- That also makes overrides a tool for debate: "take this argument, but plug in my version of `C`." If it still checks, the conclusion survives the changed assumption. If not, the checker shows where it depended on the original.

## DPM

- Finding packages at scale: gossip between registries, or a DHT / IPFS backend, in addition to configured remote lists
- Self-describing hashes (multihash/CID) so the hash algorithm can change without breaking old IDs
- Optional signatures and attestations that keep anonymity possible
- Pinning and mirroring policies for registry operators

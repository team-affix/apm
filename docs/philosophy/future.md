# Future directions

## The logic layer

Not a separate package manager: users only ever run `dpm`. The logic language provides two things of its own:

- **A checker**, a command that validates a project directory (its source plus `deps/`). Users run it after `dpm install`, as a separate step, the way you run a compiler after `npm install`. DPM never runs it and never runs any command taken from a package.
- **Logic servers**: DPM-protocol servers whose push sequence is hash check → resolve → unpack the resolved trees → run the same checker → store. They reject with 422 on failure. They're built from the DPM server library and speak the same protocol, so `dpm` pushes to and pulls from them like any other server.

Because the client and server run the same checker, they can never disagree about what is valid.

Notes for the logic layer:

- Validity belongs to a *resolved tree*, not to a package alone. Overrides swap dependencies, so a package checked against one `C` must be re-checked when a dependent overrides `C`.
- That also makes overrides a tool for debate: "take this argument, but plug in my version of `C`." If it still checks, the conclusion survives the changed assumption. If not, the checker shows where it depended on the original.

## DPM

- Finding packages at scale: gossip between registries, or a DHT / IPFS backend, in addition to configured remote lists
- Self-describing hashes (multihash/CID) so the hash algorithm can change without breaking old IDs
- Optional signatures and attestations that keep anonymity possible
- Pinning and mirroring policies for registry operators

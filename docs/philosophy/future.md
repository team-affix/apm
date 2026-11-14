# Future directions

## The logic layer

Not a separate package manager: users only ever run `dpm`. The logic language provides two things of its own:

- **A checker**, a command that validates a project directory (its source plus `deps/`). Users run it after `dpm install`, as a separate step, the way you run a compiler after `npm install`. The DPM client never runs it.
- **Logic servers**: DPM servers configured to run the same checker on every package they are asked to keep (`DPM_CHECK="unilog check"`), and to refuse those that fail. `dpm` pushes to and installs from them like any other server.

Because the client and server run the same checker, they can never disagree about what is valid.

Notes for the logic layer:

- A CID fixes its whole tree, so validity belongs to the CID itself: a logic server that keeps a CID has checked exactly that argument and everything it rests on, permanently.
- To answer an argument with a changed assumption ("take this argument, but with my version of `C`"), publish a copy that depends on your `C`. It gets a new CID that anyone can inspect. If it still checks, the conclusion survives the changed assumption. If not, the checker shows where it depended on the original.

## DPM

- Finding packages: a searchable index on servers, or published lists of CIDs. IPFS deliberately has no global index.
- Optional signatures and attestations that keep anonymity possible
- Pinning and mirroring policies for server operators

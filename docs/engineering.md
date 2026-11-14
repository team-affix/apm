# Engineering principles

## Decide, then commit

Never make a lasting change you might have to undo because a check you haven't run yet could fail. Run the check
first; make the change only once the outcome is decided.

It's the same rule as testing code before `git push`: you don't push and then revert when the tests fail.

For DPM, the lasting change is a **pin**. A pin tells Kubo to keep content permanently and to serve it to
anyone who asks. So:

- **Never pin something you might unpin because of a check that hasn't run yet.**
  - A server fetches a pushed package's whole tree *without pinning*, runs its policy (e.g. `unilog check`), and
    pins only if the package passes. A refused package was never pinned, so there is nothing to undo, and no
    chance that a failed undo leaves invalid content hosted.
  - `dpm` never pins, or changes what a node keeps in any other way: it only reads from IPFS. `dpm install`
    fetches. The user checks what was installed (e.g. `unilog check`), then decides to keep it with
    `ipfs pin add <cid>`, or its whole tree with `dpm tree <cid> | xargs -n1 ipfs pin add`. `dpm tree` fetches
    the whole tree before printing anything, so a tree that can't be completed prints nothing, and nothing is
    pinned.
- **Fetching is not keeping.** Fetched data is cached like anything a Kubo node downloads, until garbage
  collection. That's Kubo's normal behaviour; DPM doesn't add work to fight it.
- **Unpinning is for decisions, not for recovering from a premature pin.** It happens when someone withdraws a
  request, or to undo a half-finished operation after an unexpected error from Kubo itself.

More generally: prefer the order of operations that needs no cleanup. Work with the tools' natural behaviour
(here, Kubo's) rather than doing something and then undoing it.

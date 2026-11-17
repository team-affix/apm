# Engineering principles

## Decide, then commit

Never make a lasting change you might have to undo because a check you haven't run yet could fail. Run the check
first; make the change only once the outcome is decided.

It's the same rule as testing code before `git push`: you don't push and then revert when the tests fail.

For DPM, the lasting change is a **pin**. A pin tells Kubo to keep content permanently and to serve it to
anyone who asks. So:

- **Never pin something you might unpin because of a check that hasn't run yet.**
  - A server that checks packages (e.g. unilog-server) fetches a pushed package's whole tree *without pinning*,
    checks it, and pins only if the package passes. A refused package was never pinned, so there is nothing to
    undo, and no chance that a failed undo leaves invalid content hosted.
  - `dpm pack` creates your own package, then adds and pins it: by packing it, you've decided to publish it. Apart from that,
    `dpm` never pins or changes what a node keeps. `dpm install` fetches. The user checks what was installed
    (e.g. `unilog check`), then decides to keep it with `ipfs pin add <cid>`, or its whole tree with
    `dpm package tree <cid> --flat | ipfs pin add`. That fetches the whole tree before printing anything, so a
    tree that can't be completed prints nothing, and nothing is pinned.
- **Fetching is not keeping.** Fetched data is cached like anything a Kubo node downloads, until garbage
  collection. That's Kubo's normal behaviour; DPM doesn't add work to fight it.
- **Unpinning is not for recovering from a premature pin.** Since nothing is pinned before the decision, there
  is never a premature pin to take back.

More generally: prefer the order of operations that needs no cleanup. Work with the tools' natural behaviour
(here, Kubo's) rather than doing something and then undoing it.

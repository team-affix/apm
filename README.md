# DPM: Decentralized Package Manager

DPM stores immutable, content-addressed packages across any number of independent registries.

- A package is a **name**, a set of **direct dependency IDs**, and an **opaque payload**.
- Its ID is `name@sha256(content)`. The ID says *what* a package is, never *where* it lives, so any registry with the bytes is a valid source, and every fetch is checked against the ID.
- Dependencies are resolved by name with **overrides** and **peer-conflict** detection, across whatever registries you point at.
- Registries are dumb stores. The resolver is separate. Anything else (e.g. logic validation) is added as one `verify` step between resolve and put.

DPM is the storage layer of a logic platform for public discourse (see [docs/philosophy](docs/philosophy/index.md)), but it knows nothing about logic and works for any kind of content. It replaces the earlier Agda-specific APM.

## Install

```bash
npm i -g @team-affix/dpm   # provides `dpm` and `dpm-server`
```

Requires Node.js 20+.

## Quickstart

```bash
# run a registry
PORT=3000 dpm-server &

dpm remote add home http://localhost:3000

# publish something
mkdir base && cd base
dpm init Base
echo "axiom A" > Base/axioms.txt
BASE=$(dpm pack)            # Base@<sha256>
dpm push $BASE home

# depend on it
mkdir ../app && cd ../app
dpm init App
dpm add $BASE
dpm install                 # writes deps/Base/axioms.txt
```

See the [CLI reference](docs/cli.md) and the [architecture](docs/architecture.md) (package format, resolution rules, HTTP protocol, building a layer on top).

## Library

```ts
import { Package, Registry, RemoteRegistry, resolve, ingest } from '@team-affix/dpm';
import { createServer } from '@team-affix/dpm/server';
import { pull, push, Project } from '@team-affix/dpm/client';
```

## Development

```bash
npm ci
npm test          # vitest
npm run lint
npm run build
```

Layout:

```
src/core     package format, registry, resolver, ingest, HTTP client, archive helpers
src/server   HTTP server (dpm-server)
src/client   projects, push/pull, CLI (dpm)
test/        unit tests and end-to-end tests against real servers
docs/        architecture, CLI and philosophy
```

# DPM: Decentralized Package Manager

DPM stores immutable, content-addressed packages across any number of independent registries.

- A package is a **name**, a set of **direct dependency IDs**, and an **opaque payload**.
- Its ID is `name@sha256(content)`. The ID says *what* a package is, never *where* it lives, so any registry with the bytes is a valid source, and every fetch is checked against the ID.
- Dependencies are resolved by name with **overrides** and **peer-conflict** detection, across whatever registries you point at.
- Registries are dumb stores, and the resolver is separate.

**DPM is a protocol** ([spec](docs/protocol.md)), like Git: every server shares the format, the identity rule, the resolution rules and the HTTP interface, but each server sets its own acceptance policy. There is **one client, `dpm`**, for every kind of content and every server. Validating content (checking logic, compiling code) is the job of the content's own tools, run on a project after `dpm install`. This repository contains the spec, a library for building servers (and other tools), and the reference `dpm` and `dpm-server`.

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

See the [protocol spec](docs/protocol.md), the [architecture](docs/architecture.md) (library, reference implementations, writing your own server) and the [CLI reference](docs/cli.md).

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
src/core     package format, registry, resolver, ingest, protocol client, archive helpers
src/server   protocol server parts + reference server (dpm-server)
src/client   projects, push/pull, client home + reference CLI (dpm)
test/        unit tests and end-to-end tests against real servers
docs/        protocol spec, architecture, CLI and philosophy
```

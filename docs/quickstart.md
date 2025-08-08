# Quickstart

This guide walks through creating a minimal Agda project, packaging it, and transferring it via a local registry server.

## Prerequisites

- Node.js 18+
- Agda installed and available on PATH (`agda --version`)
- Install APM tools:

```bash
npm i -g @team-affix/apm-client @team-affix/apm-server
```

## Start a registry server

```bash
apm-server
# or set a port: PORT=4000 apm-server
```

In another terminal, add the server as a remote and check health:

```bash
apm remote add local http://localhost:3000
apm remote health local
```

## Create a project

```bash
mkdir Absurdity && cd Absurdity
apm init Absurdity
```

Create a minimal Agda file `Absurdity/Main.agda`:

```agda
module Absurdity.Main where

open import Agda.Builtin.Nat

one : Nat
one = suc zero
```

Typecheck:

```bash
apm check
```

## Package and register locally

```bash
apm pack
# prints: Package created: Absurdity@<sha256>
```

## Push to a remote

```bash
apm package push local Absurdity@<sha256>
```

## Pull from a remote elsewhere

On another machine or later:

```bash
apm remote add local http://localhost:3000
apm package pull local Absurdity@<sha256>
```

Now `Absurdity@<sha256>` is present in your local registry and can be listed via:

```bash
apm package ls
```

# AI / LLM disclosure

Rally is a **heavily AI-developed codebase.** The large majority of its code,
documentation, migrations, and configuration was written by **LLM coding agents**
(various tools) working **under human direction, with a human reviewing,
testing, and steering** every step. It was built this way intentionally — Rally
is partly an experiment in how far agent-driven development can go on a real,
shipped product.

We disclose this for transparency, in the spirit of projects that publish an
explicit stance on AI use.

## What this means

- **For users.** The app is real and running, but treat it like any young
  open-source project: read the code, and review before relying on it for
  anything critical. The [security model](./README.md#security-model) is
  documented; the API is server-mediated and trip-scoped.
- **For contributors.** AI-assisted contributions are **welcome** — that's how
  the project is built. Whatever tools you use, *you* are responsible for your
  PR: it should be understood, tested, and reviewed by a human (you) before
  submission. See [CONTRIBUTING.md](./CONTRIBUTING.md).
- **Quality bar.** Changes are expected to pass `pnpm check` (types) and
  `pnpm build`, follow the existing patterns, and include a migration for any
  data change. AI speeds the work; it doesn't lower the bar.

## How AI is used here

- Feature implementation, refactors, docs, and PocketBase migrations — generated
  by the agent, then reviewed and verified (type-check, build, and live testing
  against a running instance) before shipping.
- Human owns: product decisions, design direction, security review, and the
  final call on what merges and deploys.

## Provenance

Commits are authored by the maintainer, who is accountable for the result
regardless of how it was produced. If you spot something off, please open an
issue — extra human eyes are exactly what a codebase like this benefits from.

# ToDoMate

A calendar-first companion for tasks, rich notes, habits and calories — with a handoff
from finished notes into [LearnHarness](https://github.com/amosblomqvist/learnharness)'s
knowledge graph.

## What it does

- **Calendar & tasks** — a month grid; pick a day and add tasks to it. Defaults to today.
  Tasks can be grouped under **headings**, tagged, reordered and marked done. Tag a task
  `persistent` and it shows on every day; tag it `someday` to label unscheduled ideas.
- **Per-task notes (Obsidian-style)** — every task can have a Markdown note with
  - nested checklists (`- [ ]`),
  - LaTeX via KaTeX (`$x^2$` and `$$…$$`),
  - `[[wikilinks]]`,
  - pasted/attached images.
  Toggle between a raw editor and a rendered preview.
- **Habits** — daily or weekly, with a rolling 7-day check strip and streak counter.
- **Calories** — three slots a day (breakfast, lunch, dinner), entries per slot, daily
  total against a configurable goal.
- **LearnHarness handoff** — link a task to a LearnHarness subject, write its note, mark
  it done, then **Send to LearnHarness**. ToDoMate writes a self-contained Markdown file
  with frontmatter into a configurable handoff folder. See
  [`docs/learnharness-integration.md`](docs/learnharness-integration.md).

## Stack

Tauri v2 desktop shell (Rust) + Vite + React 19 + TypeScript + Tailwind 4.

The browser frontend runs on its own, so you can develop and test without Rust. A small
storage port has two adapters: `localStorage` for `npm run dev`, and Rust commands writing
JSON/files in the app-data directory for the native build.

## Getting started

```bash
npm install
npm run dev          # http://localhost:1420 — full UI in the browser
```

Native desktop (requires the [Rust toolchain](https://rustup.rs) and Tauri's system deps):

```bash
rustup toolchain install stable   # if cargo/rustc are not installed
npm run tauri dev
```

### Desktop / Windows .exe

The autostart plugin needs Rust ≥ 1.90. To produce the Windows installers:

```bash
npm install
npm run tauri build     # Windows: MSI + NSIS .exe installers
```

Installers land in `src-tauri/target/release/bundle/msi/` and
`src-tauri/target/release/bundle/nsis/`. In the desktop build, **Settings → Desktop →
"Open at login"** starts ToDoMate when you sign in. This toggle appears only in the
desktop build, not in the browser dev server.

## Scripts

| Script | Purpose |
| --- | --- |
| `npm run dev` | Vite dev server (browser mode, no Rust needed) |
| `npm run build` | Typecheck + production frontend build |
| `npm run typecheck` | `tsc --noEmit` |
| `npm test` | Unit tests (date + handoff transforms) |
| `npm run tauri dev` | Run the desktop app (needs Rust) |
| `npm run tauri build` | Build Windows .exe installers (MSI + NSIS) under src-tauri/target/release/bundle/ |

## Layout

```
src/
  domain/       dates, models/schemas (Zod), ids
  storage/      port + localStorage / Tauri adapters
  state/        StoreProvider, actions, debounced persistence
  lib/          handoff Markdown builder
  components/   calendar, tasks, notes editor, habits, calories, settings
src-tauri/      Rust shell, commands, capabilities, config
docs/           LearnHarness integration guide
```

## Data

Browser mode keeps everything in `localStorage`. Native mode writes `todomate.json` and
handoff Markdown files under the OS app-data directory. There is no account, server or
network calls from ToDoMate itself.

## License

Private / personal project. Built alongside LearnHarness.

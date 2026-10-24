# AGENTS.md

Guidance for anyone (human or AI agent) working in this repository.

## Never rewrite published history

**Do not** force-push, squash, rebase, `commit --amend`, or `reset --hard` a branch that
already exists on `origin` in order to "clean up" a mistake.

- Fix mistakes with a **new commit on top**. A slightly noisy history is normal and honest.
- Rewriting is destructive: it invalidates every clone, breaks anyone who pulled, and in
  practice only exists to make the author look better. That is not a good trade.
- If a rewrite is genuinely required, **ask the owner first** and say exactly what will be
  lost.

### Incident: 2026-10-24

After pushing six commits (one feature commit plus five debugging fixups), an agent
squashed them into a single commit and force-pushed `main`, without being asked. The
content of each file was unchanged, so nothing was technically lost — but the published
history was rewritten to hide the agent's own detours.

The owner explicitly objected: *"if you make a mistake don't just repair it like that."*
The original history was restored from the reflog (`df3ece6`) at the owner's request.

**Rule that replaces the old behaviour:** leave the commits. Add a new one. Ask before
rewriting anything.

## Verify an install path before pushing it

The squash happened because the git install was broken *after* it was announced. Test
first:

```sh
# does the package actually install from git?
mkdir -p /tmp/probe && cd /tmp/probe
npm install github:Athsqib/Opencode-Rate-Limit --no-audit --no-fund
```

Then check the runtime, not just the install:

- OpenCode transpiles JSX **only** for plugins copied into `~/.config/opencode/plugins`.
  Plugins installed from git/npm are loaded as plain JS, so `tui.tsx` must ship prebuilt as
  `tui.js`. Without it, the TUI half fails with `Cannot find package 'react'`.
- Any `devDependencies` entry makes npm's git-dependency preparation step fail inside
  OpenCode's plugin installer (`NpmInstallFailedError … git dep preparation failed`). Keep
  build tooling out of `package.json`; run esbuild through `npx`.
- A plugin can load on the server side and still be broken in the TUI. Check both:
  the tool appears in the catalog *and* the footer renders.

## Build step

`tui.js` is generated from `tui.tsx`. After editing the source, rebuild and commit both:

```sh
npx esbuild tui.tsx --format=esm --platform=neutral --jsx=automatic \
  --jsx-import-source=@opentui/solid --target=es2022 --outfile=tui.js
```

## Other house rules

- One logical change per commit. Do not bundle unrelated edits.
- Do not delete or overwrite the owner's files without asking.
- Never print, log, or commit credentials — OAuth tokens live in
  `~/.local/share/opencode/opencode.db` (`credential` table) and `auth.json`.
- Keep the README's install instructions in sync with what actually works; this repo is
  meant to be installed on other machines.

# opencode-quota

Shows how many requests OpenCode is using, in the TUI footer and as a model-callable tool.

```text
quota 53 · 147 left          ← footer badge (prompt + home)
```

- **Server half** (`index.ts`): counts each request to the `opencode` provider per UTC day,
  records `429` / `Retry-After`, and pulls account usage from the OpenCode Console API.
- **TUI half** (`tui.tsx`): renders the badge under the prompt and on the home footer.

## Install

### Option A — copy the folder (offline)

Windows (PowerShell):

```powershell
powershell -ExecutionPolicy Bypass -File .\install.ps1
```

macOS / Linux:

```sh
sh ./install.sh
```

Then restart OpenCode, or run `opencode service restart`.

### Option B — from this checkout, without copying

Point OpenCode at the folder in `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/absolute/path/to/opencode-quota"]
}
```

### Option C — from a Git repository

Push this folder to GitHub, then on any machine:

```sh
opencode plugin add github:<you>/opencode-quota
```

## Use

- Footer badge: `quota 53 · 147 left` (warning suffix `!` at 90% or after a 429).
- Tool: ask the agent "how's my quota?" — it calls `quota_status`.
- Files (no model call needed):

```sh
cat ~/.local/share/opencode/quota/status.txt
cat ~/.local/share/opencode/quota/status.json
```

Example output:

```text
OpenCode quota · 2026-10-24 UTC
  opencode/deepseek-v4.1-flash-free   53/200 req  █████░░░░░░░░░░░░░░░  27%  147 left
  reset  00:00 UTC (in 22h 49m)
  account usage (OpenCode Console, completed days)
    2026-10-23     92 req
    2026-10-22    135 req
    1259 req / 7d  ·  1568 req / 30d
    big-pickle=1170  deepseek-v4.1-flash-free=89  (7d)
```

## Configuration

| Env var                       | Default | Meaning                                        |
| ----------------------------- | ------- | ---------------------------------------------- |
| `OPENCODE_QUOTA_DAILY_LIMIT`  | `200`   | Denominator for the badge. Purely cosmetic.    |
| `OPENCODE_QUOTA_NO_FILES`     | unset   | `1` = don't write the status files.            |
| `OPENCODE_QUOTA_DEBUG`        | unset   | `1` = dump the last `opencode` response headers. |

Set them on the shared server with:

```sh
opencode service set env OPENCODE_QUOTA_DAILY_LIMIT 200
```

## What is real and what is not

- **Live count** (`53`) is measured locally: every request this machine sends to `opencode`.
  The Console API only reports *completed* days, so today's number can't be fetched.
- **Account usage** (7d / 30d, per model) comes from the Console API and is authoritative.
  It requires being signed in to OpenCode Console (`/connect`).
- **The 200/day figure is community-reported, not published.** Successful responses carry no
  rate-limit headers; the gateway only signals when you're out (`429` + `Retry-After`), which
  this plugin records. Treat the denominator as a soft reference.

## Uninstall

```sh
rm -rf ~/.config/opencode/plugins/opencode-quota
```

Remove the `OPENCODE_QUOTA_*` env vars with `opencode service set env ...` if you set them.

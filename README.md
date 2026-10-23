# opencode-quota

Shows how many requests OpenCode is using, in the TUI footer and as a model-callable tool.

```text
acct 247 today · 25 here          ← footer badge (prompt + home)
```

- `acct` — requests used by the **whole account today**, from the OpenCode Console
  usage API (every machine, a minute or two behind).
- `here` — requests **this machine** sent, counted locally and instantly.
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

### Option C — from GitHub (easiest)

```sh
opencode plugin add github:Athsqib/Opencode-Rate-Limit
```

Then restart OpenCode. This installs the plugin from
<https://github.com/Athsqib/Opencode-Rate-Limit> and adds it to the global config.

## Develop

`tui.js` is the prebuilt bundle of `tui.tsx`. OpenCode only transpiles JSX for plugins
copied into `~/.config/opencode/plugins`, so git/npm installs need the prebuilt file.
After editing `tui.tsx`, rebuild and commit both:

```sh
npx esbuild tui.tsx --format=esm --platform=neutral --jsx=automatic \
  --jsx-import-source=@opentui/solid --target=es2022 --outfile=tui.js
```

## Use

- Footer badge: `acct 247 today · 25 here`; shows `limit hit · resets 00:00 UTC` after a 429.
- Tool: ask the agent "how many requests today?" — it calls `requests_today`.
- Files (no model call needed):

```sh
cat ~/.local/share/opencode/quota/status.txt
cat ~/.local/share/opencode/quota/status.json
```

Example output:

```text
OpenCode quota · 2026-10-23 UTC
  account today     247 req   all machines · fetched 14:58 UTC
  account total   1414 req / 7d  ·  1723 req / 30d
  models 7d       big-pickle=1170  deepseek-v4.1-flash-free=244
  recent days     10-23=247  10-22=135  10-21=52  10-20=26
  this machine       24 req   counted locally since 2026-10-23 00:00 UTC
    deepseek-v4.1-flash-free  24 req
  reset  00:00 UTC (in 9h 1m)
```

## Configuration

| Env var                    | Default | Meaning                                          |
| -------------------------- | ------- | ------------------------------------------------ |
| `OPENCODE_QUOTA_NO_FILES`  | unset   | `1` = don't write the status files.              |
| `OPENCODE_QUOTA_DEBUG`     | unset   | `1` = dump the last `opencode` response headers. |

Set them on the shared server with:

```sh
opencode service set env OPENCODE_QUOTA_DEBUG 1
```

## What is real and what is not

- **`acct` (account today)** comes from the Console usage API and covers every machine on
  the account. The newest day in that API is the *current* day and updates within a minute
  or two — it is not a completed-days-only feed.
- **`here` (this machine)** is counted locally, instantly, by hooking provider requests.
  It is per machine and resets at 00:00 UTC. Two machines on one account will disagree.
- **There is no published daily cap and no endpoint that returns "remaining".** Successful
  responses carry no rate-limit headers; the gateway only signals when you are out
  (`429` + `Retry-After`), which this plugin records and shows as `limit hit`.

## Uninstall

```sh
rm -rf ~/.config/opencode/plugins/opencode-quota
```

Remove the `OPENCODE_QUOTA_*` env vars with `opencode service set env ...` if you set them.

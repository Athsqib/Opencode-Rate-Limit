/**
 * opencode-quota (terminal side)
 *
 * Renders the quota snapshot written by the server half under the prompt and
 * on the home footer, e.g.
 *
 *   acct 218 today · 165 here
 *
 * `acct` comes from the OpenCode Console usage API and covers every machine on
 * the account; `here` is what this machine counted itself. Polls the status
 * file so it never needs a model request.
 */

import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const FILE = join(homedir(), ".local", "share", "opencode", "quota", "status.json")

type Status = {
  date: string
  requests: Record<string, number>
  account?: { day: string; requests: number; fetchedAt: number }
  lastLimit?: { status?: number }
}

const isFree = (modelID: string) => /-free$/.test(modelID) || modelID === "big-pickle"

export default Plugin.define({
  id: "opencode.quota.cli",
  setup(context) {
    const [label, setLabel] = createSignal("")

    const refresh = async () => {
      try {
        const status = JSON.parse(await readFile(FILE, "utf8")) as Status
        const local = Object.entries(status.requests)
          .filter(([key]) => key.startsWith("opencode/") && isFree(key.split("/")[1] ?? ""))
          .reduce((sum, [, count]) => sum + count, 0)

        if (status.lastLimit?.status === 429) {
          setLabel("limit hit · resets 00:00 UTC")
          return
        }
        if (status.account) {
          setLabel(`acct ${status.account.requests} today · ${local} here`)
          return
        }
        setLabel(local > 0 ? `req ${local} here` : "")
      } catch {
        setLabel("")
      }
    }

    void refresh()
    const timer = setInterval(() => void refresh(), 5_000)

    const slots = [
      context.ui.slot({ append: "prompt.footer.status", render: () => <text>{label()}</text> }),
      context.ui.slot({ append: "home.footer.status", render: () => <text>{label()}</text> }),
    ]

    return () => {
      clearInterval(timer)
      for (const dispose of slots) {
        if (typeof dispose === "function") dispose()
      }
    }
  },
})

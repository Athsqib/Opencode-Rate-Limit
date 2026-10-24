/**
 * opencode-quota (terminal side)
 *
 * Renders the quota snapshot written by the server half under the prompt and
 * on the home footer, e.g. `quota 11/200 · 189 left`. Polls the status file so
 * it never needs a model request.
 */

import { Plugin } from "@opencode/plugin/tui"
import { createSignal } from "solid-js"
import { readFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const FILE = join(homedir(), ".local", "share", "opencode", "quota", "status.json")
const LIMIT = Number(process.env.OPENCODE_QUOTA_DAILY_LIMIT ?? "200") || 200

type Status = {
  date: string
  requests: Record<string, number>
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
        if (status.date !== new Date().toISOString().slice(0, 10)) {
          setLabel("")
          return
        }
        const used = Object.entries(status.requests)
          .filter(([key]) => key.startsWith("opencode/") && isFree(key.split("/")[1] ?? ""))
          .reduce((sum, [, count]) => sum + count, 0)
        const left = Math.max(0, LIMIT - used)
        const pct = Math.min(100, Math.round((used / LIMIT) * 100))
        const alert = status.lastLimit?.status === 429 || pct >= 90 ? " !" : ""
        setLabel(`req ${used}/${LIMIT} · ${left} left${alert}`)
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

/**
 * opencode-quota (server side)
 *
 * Counts how many requests this machine sends to the `opencode` provider each
 * UTC day (free tiers are capped per account per day and reset at 00:00 UTC),
 * records rate-limit response headers, and exposes the snapshot:
 *
 *   - tool   quota_status
 *   - files  ~/.local/share/opencode/quota/status.json
 *            ~/.local/share/opencode/quota/status.txt
 *
 * The TUI half (./tui.tsx) renders it under the prompt.
 *
 * Optional env:
 *   OPENCODE_QUOTA_DAILY_LIMIT   requests/day to display (default 200)
 *   OPENCODE_QUOTA_NO_FILES=1    do not write the status files
 */

import { Plugin } from "@opencode/plugin"
import { mkdir, writeFile } from "node:fs/promises"
import { homedir } from "node:os"
import { join } from "node:path"

const DAILY_LIMIT = Number(process.env.OPENCODE_QUOTA_DAILY_LIMIT ?? "200") || 200
const WRITE_FILES = process.env.OPENCODE_QUOTA_NO_FILES !== "1"
const OUT_DIR = join(homedir(), ".local", "share", "opencode", "quota")

type Account = {
  fetchedAt: number
  days: { date: string; requests: number }[]
  total7d?: number
  total30d?: number
  models7d?: { model: string; requests: number }[]
  error?: string
}

type Status = {
  date: string
  requests: Record<string, number>
  lastLimit?: {
    at: number
    model?: string
    status?: number
    headers: Record<string, string>
  }
  updated: number
}

const empty = (): Status => ({ date: utcDay(), requests: {}, updated: Date.now() })

const isFree = (modelID: string) => /-free$/.test(modelID) || modelID === "big-pickle"

function utcDay(now = new Date()) {
  return now.toISOString().slice(0, 10)
}

function nextResetAt(now = Date.now()) {
  const d = new Date(now)
  d.setUTCHours(24, 0, 0, 0)
  return d.getTime()
}

function humanDuration(ms: number) {
  if (ms <= 0) return "now"
  const total = Math.floor(ms / 1000)
  const h = Math.floor(total / 3600)
  const m = Math.floor((total % 3600) / 60)
  if (h > 0) return `${h}h ${m}m`
  if (m > 0) return `${m}m`
  return `${total}s`
}

function pickHeaders(headers: Headers) {
  const out: Record<string, string> = {}
  for (const [k, v] of headers) {
    if (/^(retry-after|x-ratelimit-.*|ratelimit-.*)$/i.test(k)) out[k.toLowerCase()] = v
  }
  return out
}

function renderAccount(a: Account | undefined) {
  if (!a) return ["  account  (not available - sign in to OpenCode Console)"]
  if (a.error) return [`  account  unavailable (${a.error})`]
  const lines = ["  account usage (OpenCode Console, completed days)"]
  const days = a.days.slice(-5)
  if (days.length === 0) {
    lines.push("    no daily rows returned")
  } else {
    const width = Math.max(...days.map((d) => d.date.length))
    for (const d of [...days].reverse()) {
      lines.push(`    ${d.date.padEnd(width)}  ${String(d.requests).padStart(5)} req`)
    }
  }
  const parts: string[] = []
  if (a.total7d !== undefined) parts.push(`${a.total7d} req / 7d`)
  if (a.total30d !== undefined) parts.push(`${a.total30d} req / 30d`)
  if (parts.length) lines.push(`    ${parts.join("  ·  ")}`)
  if (a.models7d?.length) {
    lines.push(`    ${a.models7d.map((m) => `${m.model}=${m.requests}`).join("  ")}  (7d)`)
  }
  lines.push(`    fetched ${new Date(a.fetchedAt).toISOString()}`)
  return lines
}

function render(s: Status, account?: Account) {
  const reset = nextResetAt()
  const rows = Object.entries(s.requests)
    .filter(([k]) => k.startsWith("opencode/"))
    .sort((a, b) => b[1] - a[1])

  const lines: string[] = []
  lines.push(`OpenCode quota · ${s.date} UTC`)
  if (rows.length === 0) {
    lines.push("  no requests recorded yet today")
  } else {
    const width = Math.max(...rows.map(([k]) => k.length))
    for (const [key, count] of rows) {
      const [, modelID] = key.split("/")
      if (!isFree(modelID ?? "")) {
        lines.push(`  ${key.padEnd(width)}  ${String(count).padStart(5)} req   (paid)`)
        continue
      }
      const left = Math.max(0, DAILY_LIMIT - count)
      const pct = Math.min(100, Math.round((count / DAILY_LIMIT) * 100))
      const filled = Math.round(pct / 5)
      const bar = "█".repeat(filled) + "░".repeat(20 - filled)
      lines.push(
        `  ${key.padEnd(width)}  ${String(count).padStart(3)}/${DAILY_LIMIT} req  ${bar} ${String(pct).padStart(3)}%  ${left} left`,
      )
    }
  }
  const freeTotal = Object.entries(s.requests)
    .filter(([k]) => k.startsWith("opencode/") && isFree(k.split("/")[1] ?? ""))
    .reduce((n, [, c]) => n + c, 0)
  if (rows.length > 1) {
    lines.push(`  free total  ${freeTotal} requests across free models`)
  }
  lines.push(`  reset  00:00 UTC (in ${humanDuration(reset - Date.now())})`)
  lines.push(...renderAccount(account))
  if (s.lastLimit) {
    const when = new Date(s.lastLimit.at).toISOString()
    const head = Object.entries(s.lastLimit.headers)
      .map(([k, v]) => `${k}=${v}`)
      .join(", ")
    lines.push(
      `  last rate signal  ${when}${s.lastLimit.status ? ` · HTTP ${s.lastLimit.status}` : ""}${
        s.lastLimit.model ? ` · ${s.lastLimit.model}` : ""
      }${head ? ` · ${head}` : ""}`,
    )
  }
  return lines.join("\n")
}

export default Plugin.define({
  id: "opencode.quota",
  async setup(ctx) {
    // Serialized read-modify-write so concurrent sessions cannot lose counts.
    let queue: Promise<unknown> = Promise.resolve()
    let cache: Status | undefined

    const load = async (): Promise<Status> => {
      const stored = (await ctx.storage.get("status")) as Status | undefined
      const today = utcDay()
      if (!stored || stored.date !== today) {
        cache = empty()
        await ctx.storage.set("status", cache)
        return cache
      }
      cache = stored
      return cache
    }

    const persist = async (s: Status) => {
      s.updated = Date.now()
      cache = s
      await ctx.storage.set("status", s)
      if (!WRITE_FILES) return
      const text = render(s) + "\n"
      try {
        await mkdir(OUT_DIR, { recursive: true })
        await writeFile(join(OUT_DIR, "status.json"), JSON.stringify(s, null, 2), "utf8")
        await writeFile(join(OUT_DIR, "status.txt"), text, "utf8")
      } catch {
        // status files are a convenience, never fail a request over them
      }
    }

    const mutate = (fn: (s: Status) => void) => {
      queue = queue
        .then(async () => {
          const s = await load()
          fn(s)
          await persist(s)
        })
        .catch(() => {})
    }

    await load().catch(() => {})

    const readAccount = async () => (await ctx.storage.get("account")) as Account | undefined

    const accessToken = async () => {
      try {
        const connection = await ctx.integration.connection.active("opencode")
        if (!connection) return
        const credential = await ctx.integration.connection.resolve(connection)
        if (!credential) return
        if (credential.type === "oauth") return credential.access
        if (credential.type === "key") return credential.key
      } catch {
        return
      }
    }

    let pulling: Promise<Account | undefined> | undefined
    const pullAccount = (maxAge = 5 * 60_000): Promise<Account | undefined> => {
      if (pulling) return pulling
      pulling = (async () => {
        const cached = await readAccount()
        if (cached && Date.now() - cached.fetchedAt < maxAge) return cached
        const token = await accessToken()
        if (!token) return cached
        const headers = { authorization: `Bearer ${token}` }
        const base = "https://opencode.ai/console/api/usage"
        const get = async (path: string) => {
          try {
            const response = await fetch(base + path, { headers })
            if (!response.ok) return undefined
            return (await response.json()) as unknown
          } catch {
            return undefined
          }
        }
        const [byDay, week, month, models] = await Promise.all([
          get("/cost-by-day?range=7d"),
          get("/summary?range=7d"),
          get("/summary?range=30d"),
          get("/models?range=7d"),
        ])
        const days = Array.isArray(byDay)
          ? byDay.map((d) => ({ date: String(d.date), requests: Number(d.totalRequests) || 0 }))
          : (cached?.days ?? [])
        const items = (models as { items?: { model: string; totalRequests: string }[] } | undefined)?.items
        const next: Account = {
          fetchedAt: Date.now(),
          days,
          total7d: week ? Number(week.totalRequests) : undefined,
          total30d: month ? Number(month.totalRequests) : undefined,
          models7d: items?.map((i) => ({ model: i.model, requests: Number(i.totalRequests) || 0 })),
          error: byDay || week ? undefined : "request failed",
        }
        await ctx.storage.set("account", next)
        return next
      })()
        .catch(() => undefined)
        .finally(() => {
          pulling = undefined
        })
      return pulling
    }

    void pullAccount()
    const accountTimer = setInterval(() => void pullAccount(), 5 * 60_000)

    // Count every provider call. `primary` covers the agent loop (including
    // tool-driven continuations), `generate` covers transient generations.
    await ctx.session.hook("http.request", (event) => {
      try {
        const providerID = event.model?.providerID
        const modelID = event.model?.id
        if (providerID !== "opencode" || !modelID) return
        if (event.kind !== "primary" && event.kind !== "generate") return
        const key = `${providerID}/${modelID}`
        mutate((s) => {
          s.requests[key] = (s.requests[key] ?? 0) + 1
        })
      } catch {
        // never break a request
      }
    })

    // Capture rate-limit headers, especially the Retry-After on a 429.
    await ctx.session.hook("http.response", (event) => {
      try {
        const headers = pickHeaders(event.response.headers)
        const status = event.response.status
        if (process.env.OPENCODE_QUOTA_DEBUG === "1" && event.model?.providerID === "opencode") {
          const all: Record<string, string> = {}
          for (const [k, v] of event.response.headers) all[k] = v
          void mkdir(OUT_DIR, { recursive: true })
            .then(() => writeFile(join(OUT_DIR, "last-headers.json"), JSON.stringify(all, null, 2), "utf8"))
            .catch(() => {})
        }
        if (status !== 429 && Object.keys(headers).length === 0) return
        const model =
          event.model?.providerID && event.model?.id ? `${event.model.providerID}/${event.model.id}` : undefined
        mutate((s) => {
          s.lastLimit = { at: Date.now(), model, status: status === 429 ? 429 : undefined, headers }
        })
      } catch {
        // never break a response
      }
    })

    await ctx.tool.transform((editor) => {
      editor.namespace({ name: "quota", description: "OpenCode request quota" })
      editor.add({
        name: "status",
        description:
          "Show today's OpenCode provider request usage (free models are capped per day), the next reset, and any rate-limit headers seen.",
        input: { type: "object", properties: {}, additionalProperties: false },
        options: { namespace: "quota", codemode: true },
        execute: async () => {
          const account = await pullAccount(60_000)
          return { content: render(await load(), account) }
        },
      })
    })

    return async () => {
      clearInterval(accountTimer)
      await queue.catch(() => {})
    }
  },
})

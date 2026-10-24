import { jsx } from "@opentui/solid/jsx-runtime";
import { Plugin } from "@opencode/plugin/tui";
import { createSignal } from "solid-js";
import { readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join } from "node:path";
const FILE = join(homedir(), ".local", "share", "opencode", "quota", "status.json");
const LIMIT = Number(process.env.OPENCODE_QUOTA_DAILY_LIMIT ?? "200") || 200;
const isFree = (modelID) => /-free$/.test(modelID) || modelID === "big-pickle";
var tui_default = Plugin.define({
  id: "opencode.quota.cli",
  setup(context) {
    const [label, setLabel] = createSignal("");
    const refresh = async () => {
      try {
        const status = JSON.parse(await readFile(FILE, "utf8"));
        if (status.date !== (/* @__PURE__ */ new Date()).toISOString().slice(0, 10)) {
          setLabel("");
          return;
        }
        const used = Object.entries(status.requests).filter(([key]) => key.startsWith("opencode/") && isFree(key.split("/")[1] ?? "")).reduce((sum, [, count]) => sum + count, 0);
        const left = Math.max(0, LIMIT - used);
        const pct = Math.min(100, Math.round(used / LIMIT * 100));
        const alert = status.lastLimit?.status === 429 || pct >= 90 ? " !" : "";
        setLabel(`req ${used}/${LIMIT} \xB7 ${left} left${alert}`);
      } catch {
        setLabel("");
      }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 5e3);
    const slots = [
      context.ui.slot({ append: "prompt.footer.status", render: () => /* @__PURE__ */ jsx("text", { children: label() }) }),
      context.ui.slot({ append: "home.footer.status", render: () => /* @__PURE__ */ jsx("text", { children: label() }) })
    ];
    return () => {
      clearInterval(timer);
      for (const dispose of slots) {
        if (typeof dispose === "function") dispose();
      }
    };
  }
});
export {
  tui_default as default
};

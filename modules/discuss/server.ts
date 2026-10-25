// The backend of 热点评论: a schedule that collects and translates discussions, and the route that reads them.
import { defineServerModule } from "@aihot/backend/modules";
import { registerDiscuss } from "./api/routes.ts";
import { collectDiscussions, discussRetention } from "./backend/collect.ts";

export default defineServerModule({
  name: "discuss",
  http: registerDiscuss,
  models: {
    discuss: { label: "热点评论（把讨论区的高赞评论译成中文，概括主要观点）", env: "DISCUSS_MODEL", purposes: ["discuss_story"] },
  },
  // Reading HN and Reddit is collection: it stops with the engine's under COLLECT_ENABLED.
  schedules: [{ name: "discuss.collect", cron: "7,22,37,52 * * * *", run: () => collectDiscussions(), when: () => process.env.COLLECT_ENABLED === "true" }],
  retention: discussRetention,
});

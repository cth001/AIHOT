// The backend of 社媒素材包: making each day's kit and the admin routes that show it.
import { defineServerModule } from "@aihot/backend/modules";
import { registerSocialKit } from "./api/routes.ts";
import { composeDue, socialkitRetention } from "./backend/compose.ts";

export default defineServerModule({
  name: "socialkit",
  http: registerSocialKit,
  models: {
    social: { label: "社媒素材包（每天热度前 5 的图片文字和小红书、公众号、微博、X 文案）", env: "SOCIAL_MODEL", purposes: ["social_cards", "social_copy"] },
  },
  schedules: [{ name: "socialkit.compose", cron: "15,45 * * * *", missed: "once", run: composeDue }],
  retention: socialkitRetention,
});

// The backend of 热度日报: composing each day's issue, sending it, and the routes for the site and the admin.
import { defineServerModule } from "@aihot/backend/modules";
import { registerHotDaily } from "./api/routes.ts";
import { composeDue } from "./backend/compose.ts";
import { deliverDue } from "./backend/deliver.ts";
import { hotdailyRetention } from "./backend/subscribers.ts";

export default defineServerModule({
  name: "hotdaily",
  http: registerHotDaily,
  models: {
    hotdaily: { label: "热度日报（按热度排出的日报：本期标题、导语和每条看点）", env: "HOTDAILY_MODEL", purposes: ["hotdaily_issue"] },
  },
  schedules: [
    // Composing waits for the issue's time; sending follows on the same run and catches up after failures.
    { name: "hotdaily.compose", cron: "5,35 * * * *", missed: "once", run: composeDue },
    { name: "hotdaily.deliver", cron: "10,40 * * * *", run: deliverDue },
  ],
  retention: async () => hotdailyRetention(),
});

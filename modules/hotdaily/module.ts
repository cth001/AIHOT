// 热度日报: a daily issue ranked by heat, on the site and by email.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "hotdaily",
  pages: [
    { path: "hot-daily", file: "web/HotDailyPage.tsx", id: "hotdaily-latest" },
    { path: "hot-daily/confirm", file: "web/SubscriptionPage.tsx", id: "hotdaily-confirm" },
    { path: "hot-daily/unsubscribe", file: "web/SubscriptionPage.tsx", id: "hotdaily-unsubscribe" },
    { path: "hot-daily/:date", file: "web/HotDailyPage.tsx", id: "hotdaily-date" },
  ],
  adminPages: [{ path: "admin/hot-daily", file: "web/AdminHotDaily.tsx" }],
  apiPaths: [/^\/api\/hotdaily\//, /^\/api\/admin\/hotdaily(?:\/|$)/],
});

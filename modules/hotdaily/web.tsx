// 热度日报 on the web: its entry in the sidebar and the 我的 page, and its admin page.
import { defineWebModule } from "@aihot/web/modules";
import { IconFlame } from "@aihot/web/components/icons";
import { HOT_DAILY } from "./settings.ts";

export default defineWebModule({
  name: "hotdaily",
  sidebar: { section: "日报与分发", items: [{ to: "/hot-daily", label: "热度日报", icon: IconFlame }] },
  tools: [{ to: "/hot-daily", label: HOT_DAILY.name, icon: <IconFlame size={18} /> }],
  admin: { content: [{ to: "/admin/hot-daily", label: "热度日报" }] },
});

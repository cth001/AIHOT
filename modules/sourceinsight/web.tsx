// 信源洞察 on the web: its admin page, next to the sources.
import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "sourceinsight",
  admin: { content: [{ to: "/admin/source-insight", label: "信源洞察" }] },
});

// 社媒素材包 on the web: its admin page.
import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "socialkit",
  admin: { content: [{ to: "/admin/social-kit", label: "社媒素材包" }] },
});

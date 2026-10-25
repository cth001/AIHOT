// 社媒素材包: each day's five most-followed events as ready-to-post images and copy, in the admin.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "socialkit",
  adminPages: [{ path: "admin/social-kit", file: "web/AdminSocialKit.tsx" }],
  apiPaths: [/^\/api\/admin\/socialkit(?:\/|$)/],
});

// 信源洞察: what each source brings in, and the sites the sources keep pointing to that the site does not follow.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "sourceinsight",
  adminPages: [{ path: "admin/source-insight", file: "web/AdminSourceInsight.tsx" }],
  apiPaths: [/^\/api\/admin\/sourceinsight(?:\/|$)/],
});

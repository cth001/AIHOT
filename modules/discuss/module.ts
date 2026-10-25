// 热点评论: what Hacker News and Reddit say about a story, on its event page.
import { defineModule } from "@aihot/contracts/modules";

export default defineModule({
  name: "discuss",
  apiPaths: [/^\/api\/discuss\//],
});

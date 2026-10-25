// 热点评论 on the web: a card on the event page, after the report timeline.
import { defineWebModule } from "@aihot/web/modules";

export default defineWebModule({
  name: "discuss",
  storyPage: () => import("./web/StoryComments.tsx"),
});

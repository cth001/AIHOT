// The backend of 信源洞察: admin routes only, read on request.
import { defineServerModule } from "@aihot/backend/modules";
import { registerSourceInsight } from "./api/routes.ts";

export default defineServerModule({
  name: "sourceinsight",
  http: registerSourceInsight,
});

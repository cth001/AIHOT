// The backend of the site's modules, installed by the api and the worker when they start (site/modules/index.ts).
import type { ServerModule } from "@aihot/backend/modules";
import discuss from "@aihot/discuss/server";
import hotdaily from "@aihot/hotdaily/server";
import socialkit from "@aihot/socialkit/server";

export const SERVER_MODULES: readonly ServerModule[] = [discuss, hotdaily, socialkit];

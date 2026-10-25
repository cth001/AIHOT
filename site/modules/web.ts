// What the site's modules add to the web pages (site/modules/index.ts).
import type { WebModule } from "@aihot/web/modules";
import discuss from "@aihot/discuss/web";
import hotdaily from "@aihot/hotdaily/web";
import socialkit from "@aihot/socialkit/web";

export const WEB_MODULES: readonly WebModule[] = [discuss, hotdaily, socialkit];

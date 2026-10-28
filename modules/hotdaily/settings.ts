// 热度日报's own settings: when it is composed (Beijing time; the schedule checks every 30 minutes, so a
// whole or half hour) and how many events an issue carries, most heat first.
import { SITE } from "@aihot/site";

export const HOT_DAILY = {
  name: `${SITE.name} 热度日报`,
  time: "08:30",
  entries: 20,
};

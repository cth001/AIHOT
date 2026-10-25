// The kit's images, drawn like the site's share cards (satori with Noto Sans SC, then sharp; cached on disk by
// content): a cover and one summary card per event, in each platform's shape. 小红书 3:4, 微博 1:1 for the
// nine-grid, X 16:9, 公众号 a 2.35:1 cover with a 1:1 thumbnail.
import { createHash } from "node:crypto";
import { SITE } from "@aihot/site";
import { brandMark, clamp, h, nameMark, renderPng, type Node } from "@aihot/backend/media/og";
import type { KitCards, KitImage, KitItem, SocialKit, SocialPlatform } from "../contracts.ts";

export const SOCIAL_TEMPLATE_VERSION = "social-2026-10-25.1";

const INK = "#0e191b";
const ACCENT = "#176b75";
const HOT = "#e8553a";
const NIGHT = "#0a1012";

type Shape = "portrait" | "square" | "landscape" | "banner";
const SIZES: Record<Shape, { width: number; height: number }> = {
  portrait: { width: 1080, height: 1440 },
  square: { width: 1080, height: 1080 },
  landscape: { width: 1600, height: 900 },
  banner: { width: 900, height: 383 },
};

const PLATFORM_SHAPES: Record<SocialPlatform, { cover: Shape[]; cards: Shape | null }> = {
  xiaohongshu: { cover: ["portrait"], cards: "portrait" },
  weibo: { cover: ["square"], cards: "square" },
  x: { cover: ["landscape"], cards: "landscape" },
  wechat: { cover: ["banner", "square"], cards: null },
};

const PLATFORM_LABEL: Record<SocialPlatform, string> = { xiaohongshu: "小红书", wechat: "公众号", weibo: "微博", x: "X" };
const SHAPE_LABEL: Record<Shape, string> = { portrait: "3:4", square: "1:1", landscape: "16:9", banner: "2.35:1" };

/** Every image of a kit, in posting order per platform. */
export function kitImages(kit: Pick<SocialKit, "cards" | "items">): KitImage[] {
  if (!kit.cards) return [];
  return (Object.keys(PLATFORM_SHAPES) as SocialPlatform[]).flatMap((platform) => {
    const { cover, cards } = PLATFORM_SHAPES[platform];
    return [
      ...cover.map((shape): KitImage => ({ platform, file: `${platform}-cover-${shape}.png`, label: `${PLATFORM_LABEL[platform]}封面（${SHAPE_LABEL[shape]}）`, ...SIZES[shape] })),
      ...(cards ? kit.items.map((i): KitImage => ({ platform, file: `${platform}-card-${i.rank}.png`, label: `${PLATFORM_LABEL[platform]}概要图 ${i.rank}（${SHAPE_LABEL[cards]}）`, ...SIZES[cards] })) : []),
    ];
  });
}

const dateLabel = (date: string) => `${Number(date.slice(5, 7))} 月 ${Number(date.slice(8, 10))} 日`;

async function mark(height: number, dark: boolean): Promise<Node> {
  return (await brandMark(dark ? "wordmark-dark.svg" : "wordmark.svg", height)) ?? nameMark(height * 0.88, dark ? "#e6eded" : INK, dark ? "#2ce2e8" : ACCENT);
}

async function cover(shape: Shape, date: string, cards: KitCards, items: KitItem[]): Promise<Node> {
  const { width, height } = SIZES[shape];
  const bg = {
    width, height, display: "flex", flexDirection: "column", fontFamily: "Noto Sans SC", color: "#e6eded", backgroundColor: NIGHT,
    backgroundImage: "radial-gradient(circle at 92% 6%, rgba(232,85,58,0.35), rgba(10,16,18,0) 45%), radial-gradient(circle at 0% 100%, rgba(23,107,117,0.45), rgba(10,16,18,0) 55%)",
  };
  if (shape === "banner") {
    return h("div", { ...bg, padding: "36px 44px", justifyContent: "space-between" }, [
      h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [await mark(30, true), h("div", { display: "flex", fontSize: 22, color: "#82939a" }, dateLabel(date))]),
      h("div", { display: "flex", fontSize: 56, fontWeight: 700, lineHeight: 1.2, color: "#ffffff" }, clamp(cards.cover.headline, 16)),
      h("div", { display: "flex", fontSize: 24, color: "#b1bec0" }, clamp(cards.cover.sub, 26)),
    ]);
  }
  const s = Math.min(width, height) / 1080;
  const list = shape === "landscape" ? items.slice(0, 5) : items;
  return h("div", { ...bg, padding: `${80 * s}px ${84 * s}px ${64 * s}px` }, [
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
      await mark(46 * s, true),
      h("div", { display: "flex", fontSize: 30 * s, color: "#82939a" }, dateLabel(date)),
    ]),
    h("div", { display: "flex", marginTop: (shape === "portrait" ? 110 : 56) * s, alignItems: "center" }, [
      h("div", { width: 14 * s, height: 14 * s, borderRadius: 999, backgroundColor: HOT, marginRight: 18 * s }),
      h("div", { display: "flex", fontSize: 34 * s, fontWeight: 700, color: HOT, letterSpacing: 2 }, `今日热度 TOP ${items.length}`),
    ]),
    h("div", { display: "flex", marginTop: 24 * s, fontSize: (shape === "portrait" ? 96 : 80) * s, fontWeight: 700, lineHeight: 1.2, color: "#ffffff" }, clamp(cards.cover.headline, 16)),
    h("div", { display: "flex", marginTop: 28 * s, fontSize: 36 * s, lineHeight: 1.5, color: "#b1bec0" }, clamp(cards.cover.sub, 26)),
    h("div", { display: "flex", flexDirection: "column", marginTop: (shape === "portrait" ? 80 : 44) * s, borderTop: "1px solid rgba(230,237,237,0.14)" },
      list.map((i) => h("div", { display: "flex", alignItems: "center", padding: `${(shape === "portrait" ? 26 : 18) * s}px 0`, borderBottom: "1px solid rgba(230,237,237,0.14)" }, [
        h("div", { display: "flex", width: 76 * s, fontSize: 40 * s, fontWeight: 700, color: i.rank <= 3 ? HOT : "#82939a" }, String(i.rank).padStart(2, "0")),
        h("div", { display: "flex", flex: 1, fontSize: 34 * s, color: "#e6eded" }, clamp(cards.items.find((c) => c.rank === i.rank)?.headline ?? i.title, shape === "landscape" ? 40 : 24)),
      ]))),
    h("div", { display: "flex", flex: 1 }),
    h("div", { display: "flex", fontSize: 26 * s, color: "#82939a" }, `${SITE.name} · 按独立来源的报道和讨论热度排序`),
  ]);
}

async function card(shape: Shape, date: string, cards: KitCards, item: KitItem, total: number): Promise<Node> {
  const { width, height } = SIZES[shape];
  const s = Math.min(width, height) / 1080;
  const c = cards.items.find((x) => x.rank === item.rank) ?? { tag: "热点", headline: item.title, points: [] };
  const wide = shape === "landscape";
  const square = shape === "square";
  const points = h("div", { display: "flex", flexDirection: "column", marginTop: (wide ? 36 : square ? 30 : 64) * s, flexShrink: 0 },
    c.points.map((p) => h("div", { display: "flex", alignItems: "flex-start", marginTop: (square ? 18 : 26) * s }, [
      h("div", { width: 12 * s, height: 12 * s, borderRadius: 999, backgroundColor: ACCENT, marginTop: 20 * s, marginRight: 22 * s, flexShrink: 0 }),
      h("div", { display: "flex", flex: 1, fontSize: (shape === "portrait" ? 42 : square ? 36 : 38) * s, lineHeight: 1.55, color: "#2a383c" }, p),
    ])));
  return h("div", {
    width, height, display: "flex", flexDirection: "column", padding: `${76 * s}px ${84 * s}px ${60 * s}px`, fontFamily: "Noto Sans SC", color: INK, backgroundColor: "#f5f6f5",
    backgroundImage: "radial-gradient(circle at 100% 0%, rgba(23,107,117,0.16), rgba(245,246,245,0) 50%), radial-gradient(circle at 0% 100%, rgba(232,85,58,0.08), rgba(245,246,245,0) 45%)",
  }, [
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between" }, [
      await mark(42 * s, false),
      h("div", { display: "flex", fontSize: 28 * s, color: "#66757a" }, `${dateLabel(date)} · ${item.rank}/${total}`),
    ]),
    h("div", { display: "flex", alignItems: "flex-end", flexShrink: 0, marginTop: (wide ? 40 : square ? 44 : 100) * s }, [
      h("div", { display: "flex", fontSize: (wide || square ? 120 : 150) * s, fontWeight: 700, lineHeight: 1, color: item.rank <= 3 ? HOT : ACCENT, marginRight: 28 * s }, String(item.rank).padStart(2, "0")),
      h("div", { display: "flex", marginBottom: 14 * s, padding: `${6 * s}px ${20 * s}px`, borderRadius: 999, backgroundColor: "rgba(23,107,117,0.1)", fontSize: 30 * s, fontWeight: 700, color: ACCENT }, c.tag),
    ]),
    h("div", { display: "flex", flexShrink: 0, marginTop: (square ? 28 : 36) * s, fontSize: (wide ? 60 : square ? 58 : 70) * s, fontWeight: 700, lineHeight: 1.3, color: INK }, c.headline),
    points,
    // The event's own summary fills the room the points leave.
    item.summary && !square
      ? h("div", { display: "flex", flexDirection: "column", marginTop: (wide ? 32 : 56) * s, padding: `${26 * s}px ${30 * s}px`, borderRadius: 24 * s, backgroundColor: "rgba(255,255,255,0.75)", border: "1px solid rgba(14,25,27,0.06)" }, [
          h("div", { display: "flex", fontSize: 26 * s, fontWeight: 700, color: ACCENT }, "事件概要"),
          h("div", { display: "flex", marginTop: 10 * s, fontSize: 30 * s, lineHeight: 1.65, color: "#3a484c" }, clamp(item.summary, wide ? 70 : 120)),
        ])
      : null,
    h("div", { display: "flex", flex: 1 }),
    h("div", { display: "flex", alignItems: "center", justifyContent: "space-between", paddingTop: 26 * s, borderTop: "1px solid rgba(14,25,27,0.1)", fontSize: 26 * s, color: "#66757a" }, [
      h("div", { display: "flex" }, `${item.participantCount} 个来源参与报道`),
      h("div", { display: "flex" }, `${SITE.name} · ${SITE.tagline}`),
    ]),
  ].filter(Boolean));
}

/** PNG bytes of one of the kit's images, or null when the kit has no such image. */
export async function kitImage(kit: SocialKit, file: string): Promise<Buffer | null> {
  const image = kitImages(kit).find((i) => i.file === file);
  if (!image || !kit.cards) return null;
  const cards = kit.cards;
  const coverShape = /-cover-(portrait|square|landscape|banner)\.png$/.exec(file)?.[1] as Shape | undefined;
  const rank = Number(/-card-(\d+)\.png$/.exec(file)?.[1]);
  const item = kit.items.find((i) => i.rank === rank);
  const shape = coverShape ?? PLATFORM_SHAPES[image.platform].cards;
  if (!shape) return null;
  const key = createHash("sha256").update(SOCIAL_TEMPLATE_VERSION).update(JSON.stringify([kit.date, file, cards, kit.items])).digest("hex").slice(0, 24);
  return renderPng(`social-${key}`, SIZES[shape], () => (coverShape ? cover(shape, kit.date, cards, kit.items) : card(shape, kit.date, cards, item!, kit.items.length)));
}

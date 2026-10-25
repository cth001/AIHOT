// /admin/social-kit: today's (or an earlier day's) five events, each platform's images to download and its
// post to copy. Everything is written by a model from the events' own words: read it before posting.
import { useState, type ReactNode } from "react";
import { useLoaderData, useSearchParams } from "react-router";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { copyText } from "@aihot/web/lib/clipboard";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { toast } from "@aihot/web/features/admin/toast";
import { AdminPage, Badge, Button, Card, Empty, Select } from "@aihot/web/features/admin/ui";
import type { KitImage, SocialKit, SocialKitAdmin, SocialPlatform } from "../contracts.ts";
import { SOCIAL_KIT } from "../settings.ts";

export async function loader({ request }: { request: Request }) {
  return adminGet<SocialKitAdmin>(request, `/api/admin/socialkit${new URL(request.url).search}`);
}

export function meta() {
  return [{ title: `社媒素材包 · ${SITE.name} 后台` }];
}

const PLATFORMS: Array<{ key: SocialPlatform; label: string }> = [
  { key: "xiaohongshu", label: "小红书" },
  { key: "wechat", label: "公众号 / 视频号" },
  { key: "weibo", label: "微博" },
  { key: "x", label: "X" },
];

function Copyable({ label, text }: { label: string; text: string }) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="flex items-center justify-between gap-2">
        <span className="text-[12.5px] font-medium text-ink-3">{label}</span>
        <Button size="sm" onClick={() => copyText(text).then(() => toast(`已复制${label}`, "ok"), () => toast("复制失败", "error"))}>复制</Button>
      </div>
      <pre className="mt-1.5 max-h-[420px] overflow-y-auto whitespace-pre-wrap rounded-control bg-bg-sunk p-3 font-sans text-[13.5px] leading-[1.75] text-ink">{text}</pre>
    </div>
  );
}

function Copy({ kit, platform }: { kit: SocialKit; platform: SocialPlatform }): ReactNode {
  const c = kit.copy;
  if (!c) return <Empty>文案还没写好{kit.error ? `：${kit.error}` : "。"}</Empty>;
  switch (platform) {
    case "xiaohongshu":
      return <>
        <Copyable label="标题" text={c.xiaohongshu.title} />
        <Copyable label="正文" text={`${c.xiaohongshu.body}\n\n${c.xiaohongshu.tags.map((t) => `#${t}`).join(" ")}`} />
      </>;
    case "wechat":
      return <>
        <Copyable label="标题" text={c.wechat.title} />
        <Copyable label="摘要" text={c.wechat.digest} />
        <Copyable label="正文（Markdown）" text={c.wechat.body} />
      </>;
    case "weibo":
      return <Copyable label="微博正文" text={c.weibo.text} />;
    case "x":
      return <>{c.x.thread.map((t, i) => <Copyable key={i} label={`第 ${i + 1} 条（${[...t].length} 字符）`} text={t} />)}</>;
  }
}

function Images({ kit, images }: { kit: SocialKit; images: KitImage[] }) {
  if (!images.length) return <Empty>图片文字还没写好，暂时没有图片。</Empty>;
  const src = (i: KitImage) => `/api/admin/socialkit/${kit.date}/${i.file}`;
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
      {images.map((i) => (
        <figure key={i.file} className="min-w-0">
          <a href={src(i)} target="_blank" rel="noreferrer">
            <img src={src(i)} alt={i.label} loading="lazy" style={{ aspectRatio: `${i.width} / ${i.height}` }} className="w-full rounded-control bg-bg-sunk object-cover ring-1 ring-line" />
          </a>
          <figcaption className="mt-1.5 flex items-center justify-between gap-2 text-[12px] text-ink-3">
            <span className="truncate">{i.label}</span>
            <a href={`${src(i)}?download`} className="shrink-0 text-accent hover:underline">下载</a>
          </figcaption>
        </figure>
      ))}
    </div>
  );
}

export default function AdminSocialKit() {
  const { kit, dates } = useLoaderData<typeof loader>();
  const [params, setParams] = useSearchParams();
  const [platform, setPlatform] = useState<SocialPlatform>("xiaohongshu");
  const { run, pending } = useAdminAction();
  return (
    <AdminPage
      title="社媒素材包"
      subtitle={`每天 ${SOCIAL_KIT.time}（北京时间）取热度榜前 ${SOCIAL_KIT.items} 件事，生成各平台的封面、概要图和文案。由模型撰写，发布前请核对。`}
      actions={
        <>
          {dates.length > 0 && (
            <Select aria-label="日期" value={params.get("date") ?? kit?.date ?? ""} onChange={(e) => setParams({ date: e.target.value })}>
              {dates.map((d) => <option key={d} value={d}>{d}</option>)}
            </Select>
          )}
          <Button tone="primary" busy={pending === "compose"} onClick={() => run("POST", "/api/admin/socialkit/compose", {}, { label: "compose", success: "已按当前热度榜重新生成今天的素材包" })}>按当前热度重新生成</Button>
        </>
      }
    >
      {!kit ? (
        <Empty>还没有素材包。热度榜有 3 件以上的事件后，到点会自动生成，也可以点右上角立即生成。</Empty>
      ) : (
        <>
          <Card title={`${kit.date} 的 ${kit.items.length} 件事`} right={kit.error ? <Badge tone="bad" title={kit.error}>生成出错</Badge> : null}>
            <ol className="space-y-1.5 text-[13.5px] text-ink-2">
              {kit.items.map((i) => (
                <li key={i.rank}>
                  <span className="num mr-2 text-ink-4">{i.rank}</span>
                  <a href={`/story/${i.storyPublicId}`} target="_blank" rel="noreferrer" className="hover:text-accent">{i.title}</a>
                  <span className="ml-2 text-[12px] text-ink-4">{i.participantCount} 个来源</span>
                </li>
              ))}
            </ol>
          </Card>
          <div className="mt-4 flex flex-wrap gap-2">
            {PLATFORMS.map((p) => (
              <Button key={p.key} tone={platform === p.key ? "primary" : "secondary"} onClick={() => setPlatform(p.key)}>{p.label}</Button>
            ))}
          </div>
          <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)]">
            <Card title="图片"><Images kit={kit} images={kit.images.filter((i) => i.platform === platform)} /></Card>
            <Card title="文案"><Copy kit={kit} platform={platform} /></Card>
          </div>
        </>
      )}
    </AdminPage>
  );
}

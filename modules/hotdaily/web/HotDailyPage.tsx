// /hot-daily and /hot-daily/:date: one issue of 热度日报, the archive beside it, and the email sign-up.
import { useState, type FormEvent } from "react";
import { useLoaderData } from "react-router";
import { SITE } from "@aihot/site";
import { IntentLink } from "@aihot/web/components/ui/IntentLink";
import { AsideCard, EmptyState, ReadingLayout } from "@aihot/web/components/ui/Page";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { IconFlame, IconTrendUp } from "@aihot/web/components/icons";
import { cachedPage, loadOr404 } from "@aihot/web/lib/api.server";
import { pageReuse } from "@aihot/web/lib/page-reuse";
import { pageMeta } from "@aihot/web/lib/seo";
import type { HotDailyEntry, HotDailyPage } from "../contracts.ts";
import { HOT_DAILY } from "../settings.ts";

export const handle: Screen = { tab: "hot", name: "热度日报" };
export { pageHeaders as headers } from "@aihot/web/lib/api.server";
export const { clientLoader, shouldRevalidate } = pageReuse<typeof loader>();

export async function loader({ params, request }: { params: { date?: string }; request: Request }) {
  const data = await loadOr404<HotDailyPage>(`/api/hotdaily/editions/${encodeURIComponent(params.date ?? "latest")}`, { signal: request.signal });
  return cachedPage(300, data);
}

export function meta({ loaderData }: { loaderData?: HotDailyPage }) {
  const e = loaderData?.edition;
  return pageMeta({
    title: e ? `${e.title} · ${HOT_DAILY.name}` : HOT_DAILY.name,
    description: e?.lead ?? `${SITE.name} 每天按热度排出过去 48 小时最受关注的 ${HOT_DAILY.entries} 件事，可以用邮件订阅。`,
    path: e ? `/hot-daily/${e.date}` : "/hot-daily",
    image: "/og/pages/hot.png",
  });
}

function Subscribe() {
  const [email, setEmail] = useState("");
  const [state, setState] = useState<{ tone: "ok" | "bad"; text: string } | null>(null);
  const [busy, setBusy] = useState(false);
  async function submit(ev: FormEvent<HTMLFormElement>) {
    ev.preventDefault();
    setBusy(true);
    const website = String(new FormData(ev.currentTarget).get("website") ?? "");
    try {
      const res = await fetch("/api/hotdaily/subscribe", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ email, website }) });
      const json = await res.json().catch(() => null);
      setState(res.ok ? { tone: "ok", text: "确认邮件已发出，请到邮箱点击确认链接（没收到的话看看垃圾邮件）。" } : { tone: "bad", text: json?.detail ?? "订阅失败，请稍后再试。" });
    } catch {
      setState({ tone: "bad", text: "网络错误，请稍后再试。" });
    } finally {
      setBusy(false);
    }
  }
  return (
    <form onSubmit={submit} className="space-y-2.5">
      <p className="text-[13px] leading-[1.75] text-ink-3">每天 {HOT_DAILY.time} 前后发到你的邮箱，随时可以退订。</p>
      <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} placeholder="you@example.com" autoComplete="email"
        className="h-10 w-full rounded-control bg-bg px-3 text-[14px] text-ink ring-1 ring-line-strong outline-none focus:ring-accent" />
      {/* Hidden from people; scripts fill it. */}
      <input type="text" name="website" tabIndex={-1} autoComplete="off" aria-hidden="true" className="hidden" />
      <button type="submit" disabled={busy} className="h-10 w-full rounded-control bg-ink text-[14px] font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-50">
        {busy ? "提交中…" : "邮件订阅"}
      </button>
      {state && <p className={`text-[12.5px] leading-[1.7] ${state.tone === "ok" ? "text-ok" : "text-hot"}`}>{state.text}</p>}
      <p className="text-[11.5px] leading-[1.6] text-ink-4">我们只用这个邮箱发日报，详见 <IntentLink to="/privacy" className="underline">隐私说明</IntentLink>。</p>
    </form>
  );
}

function Entry({ e }: { e: HotDailyEntry }) {
  return (
    <li className="flex gap-4 py-5">
      <span className={`num w-8 shrink-0 text-[26px] font-black leading-none tracking-[-0.03em] ${e.rank <= 3 ? "text-hot" : "text-ink-3"}`}>{e.rank}</span>
      <div className="min-w-0">
        <IntentLink viewTransition to={`/story/${e.storyPublicId}`} className="text-[16.5px] font-[650] leading-[1.55] text-ink transition-colors hover:text-accent">
          {e.title}
        </IntentLink>
        {e.take && <p className="mt-1.5 text-[14px] leading-[1.75] text-ink-2"><span className="font-semibold text-accent">看点 </span>{e.take}</p>}
        {e.summary && <p className="mt-1.5 text-[13.5px] leading-[1.8] text-ink-3">{e.summary}</p>}
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-4">
          <span className="inline-flex items-center gap-1"><IconFlame size={12} />{e.participantCount} 个来源参与</span>
          {(e.trend === "up" || e.trend === "new") && <span className="inline-flex items-center gap-1 text-hot"><IconTrendUp size={12} />{e.trend === "new" ? "新上榜" : "上升"}</span>}
          {e.source && <span>代表报道：{e.source}</span>}
        </div>
      </div>
    </li>
  );
}

export default function HotDailyRoute() {
  const { edition, index, subscribe } = useLoaderData<typeof loader>();
  const aside = (
    <>
      {subscribe && <AsideCard title="订阅热度日报"><Subscribe /></AsideCard>}
      {index.length > 0 && (
        <AsideCard title="往期">
          <nav className="-mx-2 max-h-[420px] overflow-y-auto">
            {index.map((i) => (
              <IntentLink key={i.date} to={`/hot-daily/${i.date}`}
                className={`block rounded-control px-2 py-2 text-[13px] leading-[1.5] transition-colors hover:bg-bg-sunk ${i.date === edition?.date ? "text-accent" : "text-ink-2"}`}>
                <span className="num mr-2 text-ink-4">{i.date.slice(5)}</span>{i.title}
              </IntentLink>
            ))}
          </nav>
        </AsideCard>
      )}
    </>
  );
  return (
    <>
      <PhoneBar back={{ to: "/hot", label: "热点" }} title={HOT_DAILY.name} />
      <ReadingLayout aside={aside}>
        <header className="pb-2">
          <p className="text-[12.5px] text-ink-4">{HOT_DAILY.name}{edition ? ` · ${edition.date}` : ""}</p>
          <h1 data-page-title="" className="mt-1 text-[24px] font-semibold leading-[1.35] text-ink">{edition?.title ?? HOT_DAILY.name}</h1>
          {edition?.lead && <p className="mt-3 text-[14.5px] leading-[1.85] text-ink-2">{edition.lead}</p>}
          <p className="mt-3 text-[12px] text-ink-4">按过去 48 小时内独立来源的报道和讨论热度排序；看点由 AI 撰写。</p>
        </header>
        {edition && edition.entries.length > 0 ? (
          <ol className="card divide-y divide-line-soft px-5 lg:px-6">
            {edition.entries.map((e) => <Entry key={e.storyPublicId} e={e} />)}
          </ol>
        ) : (
          <EmptyState title="还没有出刊">每天 {HOT_DAILY.time} 出一期，热点不足 3 件的日子不出。</EmptyState>
        )}
      </ReadingLayout>
    </>
  );
}

// /admin/source-insight: what each source brings in (output) and the sites the sources keep linking to that the
// site does not follow yet (candidates), each with a feed probe.
import { useState } from "react";
import { Link, useLoaderData } from "react-router";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { copyText } from "@aihot/web/lib/clipboard";
import { toast } from "@aihot/web/features/admin/toast";
import { AdminPage, Badge, Button, Card, DataTable, FilterChips, Time } from "@aihot/web/features/admin/ui";
import type { CandidateDomain, CandidateReport, FeedProbe, SourceOutput, SourceOutputReport } from "../contracts.ts";

type Data = { view: "output"; report: SourceOutputReport } | { view: "candidates"; report: CandidateReport };

export async function loader({ request }: { request: Request }): Promise<Data> {
  const params = new URL(request.url).searchParams;
  const days = params.get("days") === "30" ? 30 : 7;
  return params.get("view") === "candidates"
    ? { view: "candidates", report: await adminGet<CandidateReport>(request, `/api/admin/sourceinsight/candidates?days=${days}`) }
    : { view: "output", report: await adminGet<SourceOutputReport>(request, `/api/admin/sourceinsight/output?days=${days}`) };
}

export function meta() {
  return [{ title: `信源洞察 · ${SITE.name} 后台` }];
}

const MODE = { editorial: "精选", hot_signal: "热度", isolated: "隔离" } as Record<string, string>;
const pct = (n: number, d: number) => (d ? `${Math.round((n / d) * 100)}%` : "—");

function Output({ report }: { report: SourceOutputReport }) {
  const idle = report.sources.filter((s) => s.enabled && s.collected === 0).length;
  return (
    <Card title={`各信源近 ${report.days} 天的产出`} right={idle ? <Badge tone="warn">{idle} 个启用中的信源没有采到新内容</Badge> : null} pad={false}>
      <DataTable<SourceOutput> rows={report.sources} rowKey={(s) => s.id} dense
        columns={[
          { key: "name", label: "信源", render: (s) => (
            <span className="flex flex-wrap items-center gap-1.5">
              <Link to={`/admin/sources/${encodeURIComponent(s.id)}`} className="text-ink hover:text-accent">{s.name}</Link>
              <Badge tone="muted">{s.tier}</Badge>
              <Badge tone={s.mode === "editorial" ? "info" : "muted"}>{MODE[s.mode] ?? s.mode}</Badge>
              {!s.enabled && <Badge tone="muted">已暂停</Badge>}
            </span>
          ) },
          { key: "collected", label: "采集", align: "right", render: (s) => <span className={`num ${s.enabled && !s.collected ? "text-hot" : ""}`}>{s.collected}</span> },
          { key: "listed", label: "入池", align: "right", render: (s) => <span className="num">{s.listed}</span> },
          { key: "selected", label: "入选（入选率）", align: "right", render: (s) => <span className="num">{s.selected}<span className="ml-1 text-ink-4">{pct(s.selected, s.collected)}</span></span> },
          { key: "stories", label: "参与事件", align: "right", render: (s) => <span className="num">{s.stories}</span> },
          { key: "hot", label: "上热榜前 10", align: "right", render: (s) => <span className={`num ${s.hotStories ? "font-semibold text-accent" : ""}`}>{s.hotStories}</span> },
          { key: "fail", label: "7 天失败率", align: "right", render: (s) => s.failRate === null ? <span className="text-ink-4">—</span> : <span className={`num ${s.failRate >= 0.5 ? "font-semibold text-hot" : ""}`}>{Math.round(s.failRate * 100)}%</span> },
          { key: "ok", label: "最近成功", render: (s) => <Time at={s.lastOkAt} /> },
        ]} />
      <p className="px-4 py-3 text-[12px] leading-[1.7] text-ink-4">
        采集不含新信源首次导入的存量。“入池”是进了全部动态的条目，“参与事件”是这个信源的报道或讨论被算进去的事件，“上热榜前 10”是其中在这段时间进过热度榜前 10 的。
      </p>
    </Card>
  );
}

function Probe({ domain }: { domain: string }) {
  const [state, setState] = useState<"idle" | "busy" | FeedProbe[]>("idle");
  async function run() {
    setState("busy");
    try {
      const res = await fetch(`/api/admin/sourceinsight/probe?domain=${encodeURIComponent(domain)}`, { credentials: "same-origin" });
      setState(res.ok ? ((await res.json()) as { feeds: FeedProbe[] }).feeds : []);
    } catch {
      setState([]);
    }
  }
  if (state === "idle" || state === "busy") return <Button size="sm" busy={state === "busy"} onClick={run}>探测订阅</Button>;
  if (!state.length) return <span className="text-[12px] text-ink-4">没找到 RSS，可考虑网页列表</span>;
  return (
    <ul className="space-y-1">
      {state.map((f) => (
        <li key={f.url} className="flex flex-wrap items-center gap-2 text-[12px]">
          <span className="max-w-[260px] truncate text-ink-2" title={f.url}>{f.url}</span>
          <span className="num text-ink-4">{f.items} 条{f.newest ? ` · 最新 ${f.newest.slice(0, 10)}` : ""}</span>
          <button type="button" className="text-accent hover:underline" onClick={() => copyText(f.url).then(() => toast("已复制订阅地址", "ok"))}>复制</button>
        </li>
      ))}
    </ul>
  );
}

function Candidates({ report }: { report: CandidateReport }) {
  return (
    <Card title={`近 ${report.days} 天被引用最多、但还没关注的网站`} right={<span className="text-[12px] text-ink-4">读了 {report.articles} 篇精选信源的文章</span>} pad={false}>
      <DataTable<CandidateDomain> rows={report.candidates} rowKey={(c) => c.domain} empty="这段时间没有被多篇文章引用的新网站"
        columns={[
          { key: "domain", label: "网站", render: (c) => (
            <span className="flex flex-col">
              <a href={`https://${c.domain}/`} target="_blank" rel="noreferrer" className="font-medium text-ink hover:text-accent">{c.domain}</a>
              {c.examples.slice(0, 2).map((e) => <a key={e} href={e} target="_blank" rel="noreferrer nofollow" className="max-w-[320px] truncate text-[11.5px] text-ink-4 hover:text-accent">{e}</a>)}
            </span>
          ) },
          { key: "citations", label: "引用文章", align: "right", render: (c) => <span className="num">{c.citations}</span> },
          { key: "citedBy", label: "被哪些信源引用", render: (c) => <span className="text-[12.5px] text-ink-3">{c.citedBy.join("、")}</span> },
          { key: "probe", label: "", render: (c) => <Probe domain={c.domain} /> },
        ]} />
      <p className="px-4 py-3 text-[12px] leading-[1.7] text-ink-4">
        按引用它的信源数、再按引用文章数排序，只列至少被 2 篇文章引用的。社交网络、代码托管、短链接等不算信源，已经关注的网站也不列。找到订阅地址后，到 <Link to="/admin/sources/new" className="text-accent hover:underline">新建信源</Link> 粘贴并预览。
      </p>
    </Card>
  );
}

export default function AdminSourceInsight() {
  const data = useLoaderData<typeof loader>();
  return (
    <AdminPage title="信源洞察" subtitle="看每个信源实际带来了什么，以及信源们反复引用、但本站还没关注的网站。">
      <div className="mb-4 flex flex-wrap gap-3">
        <FilterChips param="view" options={[{ value: "", label: "信源产出" }, { value: "candidates", label: "候选信源" }]} />
        <FilterChips param="days" options={[{ value: "", label: "近 7 天" }, { value: "30", label: "近 30 天" }]} />
      </div>
      {data.view === "output" ? <Output report={data.report} /> : <Candidates report={data.report} />}
    </AdminPage>
  );
}

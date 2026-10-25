// /admin/hot-daily: whether sending is on, subscriber counts, the latest issues and their deliveries, a test
// email, re-composing today's issue, and removing an address.
import { useState } from "react";
import { Form, useLoaderData } from "react-router";
import { SITE } from "@aihot/site";
import { adminGet } from "@aihot/web/lib/admin.server";
import { useAdminAction } from "@aihot/web/features/admin/action";
import { AdminPage, Badge, Button, Card, DataTable, Input, KV, Pager, Stat, Time } from "@aihot/web/features/admin/ui";
import type { HotDailyAdmin } from "../contracts.ts";
import { HOT_DAILY } from "../settings.ts";

export async function loader({ request }: { request: Request }) {
  return adminGet<HotDailyAdmin>(request, `/api/admin/hotdaily${new URL(request.url).search}`);
}

export function meta() {
  return [{ title: `${HOT_DAILY.name} · ${SITE.name} 后台` }];
}

const STATUS = { pending: ["待确认", "warn"], active: ["已订阅", "ok"], unsubscribed: ["已退订", "muted"] } as const;

export default function AdminHotDaily() {
  const data = useLoaderData<typeof loader>();
  const { run, pending } = useAdminAction();
  const [to, setTo] = useState("");
  const sending = data.sending;
  return (
    <AdminPage
      title={HOT_DAILY.name}
      subtitle={`每天 ${HOT_DAILY.time}（北京时间）按热度榜前 ${HOT_DAILY.entries} 件事出一期，随后发给已确认的订阅者。`}
      actions={
        <>
          <Button busy={pending === "compose"} onClick={() => run("POST", "/api/admin/hotdaily/compose", {}, { label: "compose", success: "已按当前热度榜重写今天这一期" })}>重写今天这一期</Button>
          <Button tone="primary" busy={pending === "deliver"} disabled={!sending.enabled || !sending.configured}
            onClick={() => run("POST", "/api/admin/hotdaily/deliver", undefined, { label: "deliver", success: "已补发今天这一期" })}>补发今天这一期</Button>
        </>
      }
    >
      <div className="grid gap-4 sm:grid-cols-3">
        <Stat label="已订阅" value={data.subscribers.active} tone="ok" />
        <Stat label="待确认" value={data.subscribers.pending} hint="7 天内未确认的会自动删除" />
        <Stat label="已退订" value={data.subscribers.unsubscribed} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="发信">
          <KV items={[
            ["SMTP", sending.configured ? <Badge tone="ok">已配置</Badge> : <Badge tone="bad" title="在 .env 填 SMTP_HOST、SMTP_USER、SMTP_PASS">未配置</Badge>],
            ["EMAIL_SEND_ENABLED", sending.enabled ? <Badge tone="ok">true</Badge> : <Badge tone="warn">关闭</Badge>],
            ["发件人", sending.from ?? "—"],
          ]} />
          <div className="mt-4 flex gap-2">
            <Input type="email" value={to} onChange={(e) => setTo(e.target.value)} placeholder="发一封测试邮件到…" />
            <Button busy={pending === "test"} disabled={!to} onClick={() => run("POST", "/api/admin/hotdaily/test", { email: to }, { label: "test", success: "测试邮件已发出", revalidate: false })}>发送测试</Button>
          </div>
        </Card>
        <Card title="最近各期" pad={false}>
          <DataTable dense rows={data.editions} rowKey={(e) => e.date} empty="还没有出过刊"
            columns={[
              { key: "date", label: "日期", render: (e) => <a href={`/hot-daily/${e.date}`} target="_blank" rel="noreferrer" className="text-accent">{e.date}</a> },
              { key: "title", label: "标题", render: (e) => e.title },
              { key: "sent", label: "已发", render: (e) => <span className="num">{e.sent}</span> },
              { key: "failed", label: "失败", render: (e) => (e.failed ? <Badge tone="bad">{e.failed}</Badge> : <span className="num">0</span>) },
            ]} />
        </Card>
      </div>

      <Card title="订阅者" className="mt-4" pad={false}
        right={<Form method="get" className="flex gap-2"><Input name="q" placeholder="搜索邮箱" defaultValue="" /></Form>}>
        <DataTable rows={data.rows} rowKey={(r) => r.id} empty="还没有订阅者"
          columns={[
            { key: "email", label: "邮箱", render: (r) => r.email },
            { key: "status", label: "状态", render: (r) => { const [label, tone] = STATUS[r.status as keyof typeof STATUS] ?? [r.status, "muted"]; return <Badge tone={tone}>{label}</Badge>; } },
            { key: "created", label: "提交", render: (r) => <Time at={r.createdAt} /> },
            { key: "confirmed", label: "确认", render: (r) => <Time at={r.confirmedAt} /> },
            { key: "erase", label: "", render: (r) => (
              <Button size="sm" tone="ghost" busy={pending === `erase-${r.id}`}
                onClick={() => window.confirm(`删除 ${r.email} 及其发送记录？`) && run("POST", `/api/admin/hotdaily/subscribers/${r.id}/erase`, {}, { label: `erase-${r.id}`, success: "已删除" })}>删除</Button>
            ) },
          ]} />
        <div className="p-3"><Pager page={data.page} hasMore={data.page < data.pages} /></div>
      </Card>
    </AdminPage>
  );
}

// /hot-daily/confirm and /hot-daily/unsubscribe, reached from the emails. The change waits for a click, so
// a mail scanner that opens links neither confirms nor unsubscribes anyone.
import { useState } from "react";
import { useLocation } from "react-router";
import { IntentLink } from "@aihot/web/components/ui/IntentLink";
import { PhoneBar } from "@aihot/web/components/shell/PhoneBar";
import type { Screen } from "@aihot/web/components/shell/screens";
import { HOT_DAILY } from "../settings.ts";

export const handle: Screen = { tab: "hot", name: HOT_DAILY.name };

export function meta() {
  return [{ title: HOT_DAILY.name }, { name: "robots", content: "noindex" }];
}

export default function SubscriptionPage() {
  const location = useLocation();
  const unsubscribing = location.pathname.endsWith("/unsubscribe");
  const token = new URLSearchParams(location.search).get("token") ?? "";
  const [state, setState] = useState<"idle" | "busy" | "done" | "missing" | "error">("idle");
  async function act() {
    setState("busy");
    try {
      const res = await fetch(`/api/hotdaily/${unsubscribing ? "unsubscribe" : "confirm"}`, { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ token }) });
      setState(res.ok ? "done" : res.status === 404 ? "missing" : "error");
    } catch {
      setState("error");
    }
  }
  const verb = unsubscribing ? "退订" : "确认订阅";
  return (
    <>
      <PhoneBar back={{ to: "/hot-daily", label: HOT_DAILY.name }} title={verb} />
      <div className="mx-auto max-w-[480px] px-4 py-16 text-center">
        <h1 data-page-title="" className="text-[22px] font-semibold text-ink">{verb} {HOT_DAILY.name}</h1>
        {state === "done" ? (
          <p className="mt-4 text-[14.5px] leading-[1.8] text-ink-2">
            {unsubscribing ? "已退订，之后不会再收到热度日报。想回来随时可以再订阅。" : `订阅成功！每天 ${HOT_DAILY.time} 前后，热度日报会发到你的邮箱。`}
          </p>
        ) : state === "missing" ? (
          <p className="mt-4 text-[14.5px] leading-[1.8] text-ink-2">这个链接已经失效。可以回到热度日报页面重新订阅。</p>
        ) : (
          <>
            <p className="mt-4 text-[14.5px] leading-[1.8] text-ink-3">{unsubscribing ? "点击下面的按钮，停止接收热度日报邮件。" : "点击下面的按钮，完成邮件订阅。"}</p>
            <button type="button" onClick={act} disabled={!token || state === "busy"}
              className="mt-6 h-10 rounded-control bg-ink px-6 text-[14px] font-medium text-bg transition-opacity hover:opacity-85 disabled:opacity-50">
              {state === "busy" ? "处理中…" : verb}
            </button>
            {state === "error" && <p className="mt-3 text-[12.5px] text-hot">网络错误，请稍后再试。</p>}
          </>
        )}
        <p className="mt-10"><IntentLink to="/hot-daily" className="text-[13px] text-accent hover:underline">看看最新一期 →</IntentLink></p>
      </div>
    </>
  );
}

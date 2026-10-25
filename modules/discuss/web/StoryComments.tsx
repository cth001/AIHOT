// The event page's discussions: the model's summary of what people say, then each thread's top comments
// in Chinese, with the original a tap away. Read in the browser after the page, so the page never waits.
import { useEffect, useState } from "react";
import type { StoryDetail } from "@aihot/contracts/site";
import type { StoryPagePart } from "@aihot/web/modules";
import { IconExternal, IconMessage } from "@aihot/web/components/icons";
import { relativeTime } from "@aihot/web/lib/format";
import type { DiscussComment, DiscussThread, StoryDiscussion } from "../contracts.ts";

const PLATFORM = { hn: "Hacker News", reddit: "Reddit" } as const;

function Comment({ c }: { c: DiscussComment }) {
  const [original, setOriginal] = useState(false);
  return (
    <li className="py-3">
      <p className="whitespace-pre-wrap text-[14px] leading-[1.75] text-ink-2">{original && c.original ? c.original : c.text}</p>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] text-ink-4">
        {c.author && <span>{c.author}</span>}
        {c.score !== null && <span className="num">{c.score} 赞</span>}
        {c.replies > 0 && <span className="num">{c.replies} 条回复</span>}
        {c.postedAt && <span>{relativeTime(c.postedAt)}</span>}
        {c.original && (
          <button type="button" className="text-accent hover:underline" onClick={() => setOriginal(!original)}>
            {original ? "看译文" : "看原文"}
          </button>
        )}
      </div>
    </li>
  );
}

function Thread({ t }: { t: DiscussThread }) {
  return (
    <div className="pt-4">
      <a href={t.url} target="_blank" rel="noreferrer nofollow" className="group flex items-baseline gap-2 text-[13px]">
        <span className="shrink-0 font-semibold text-ink">{PLATFORM[t.platform]}{t.community ? ` · ${t.community}` : ""}</span>
        <span className="num shrink-0 text-ink-4">{t.points} 分 · {t.commentCount} 条评论</span>
        <IconExternal size={13} className="shrink-0 self-center text-ink-4 transition-colors group-hover:text-accent" />
      </a>
      <ol className="divide-y divide-line-soft">
        {t.comments.map((c) => <Comment key={c.id} c={c} />)}
      </ol>
    </div>
  );
}

function StoryComments({ story }: { story: StoryDetail }) {
  const [data, setData] = useState<StoryDiscussion | null>(null);
  useEffect(() => {
    const abort = new AbortController();
    fetch(`/api/discuss/stories/${encodeURIComponent(story.publicId)}`, { signal: abort.signal })
      .then((res) => (res.ok ? res.json() : null))
      .then(setData, () => {});
    return () => abort.abort();
  }, [story.publicId]);
  if (!data || data.threads.length === 0) return null;
  return (
    <section className="card p-5 lg:p-6">
      <div className="flex items-center gap-2">
        <IconMessage size={16} className="text-accent" />
        <h2 className="text-[17px] font-[650] leading-[1.5] text-ink">热点评论</h2>
      </div>
      <p className="mt-0.5 text-[12.5px] text-ink-4">来自 Hacker News 与 Reddit 的高赞评论，由 AI 译成中文。</p>
      {data.summary && (
        <p className="mt-3.5 rounded-panel bg-accent/[0.06] px-4 py-3 text-[14px] leading-[1.75] text-ink-2">
          <span className="font-semibold text-ink">讨论要点：</span>{data.summary}
        </p>
      )}
      <div className="divide-y divide-line">
        {data.threads.map((t) => <Thread key={t.url} t={t} />)}
      </div>
    </section>
  );
}

export default { Block: StoryComments } satisfies StoryPagePart;

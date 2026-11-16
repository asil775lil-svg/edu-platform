/**
 * لوحة النقاشات والأسئلة التفاعلية داخل الدرس.
 * تدعم الأسئلة الرئيسية والردود الهرمية.
 */
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { useAuth } from "../lib/auth";
import type { DiscussionItem } from "../lib/types";

interface Props {
  courseId: string;
  lessonId: string;
}

export function DiscussionPanel({ courseId, lessonId }: Props) {
  const { user } = useAuth();
  const [items, setItems] = useState<DiscussionItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [content, setContent] = useState("");
  const [replyTo, setReplyTo] = useState<DiscussionItem | null>(null);
  const [posting, setPosting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    try {
      const data = await api.discussions.list(courseId, lessonId);
      setItems(data);
    } catch {
      /* صمت */
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    setLoading(true);
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [courseId, lessonId]);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (!content.trim()) return;
    setPosting(true);
    setError(null);
    try {
      await api.discussions.post(courseId, lessonId, content.trim(), replyTo?.id);
      setContent("");
      setReplyTo(null);
      await load();
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "فشل الإرسال");
    } finally {
      setPosting(false);
    }
  }

  async function remove(discussionId: string) {
    if (!confirm("هل تريد حذف هذا التعليق؟")) return;
    try {
      await api.discussions.remove(courseId, discussionId);
      await load();
    } catch {
      /* صمت */
    }
  }

  function renderItem(item: DiscussionItem, isReply = false) {
    const isOwn = user?.id === item.user_id;
    const isTeacher = item.user_role === "teacher";
    return (
      <div
        key={item.id}
        className="card card-flat"
        style={{
          marginBottom: "0.6rem",
          marginInlineStart: isReply ? "1.5rem" : 0,
          borderInlineStart: isReply ? "2px solid var(--primary)" : undefined,
          paddingInlineStart: isReply ? "0.8rem" : undefined,
        }}
      >
        <div className="between" style={{ marginBottom: "0.3rem" }}>
          <div className="row" style={{ gap: "0.4rem" }}>
            <span style={{ fontWeight: 600 }}>{item.user_name}</span>
            {isTeacher && (
              <span
                style={{
                  fontSize: "0.7rem",
                  background: "var(--primary)",
                  color: "#fff",
                  borderRadius: 4,
                  padding: "1px 6px",
                }}
              >
                معلم
              </span>
            )}
          </div>
          <span className="small muted">
            {new Date(item.created_at).toLocaleString("ar-SA", {
              year: "numeric",
              month: "short",
              day: "numeric",
              hour: "2-digit",
              minute: "2-digit",
            })}
          </span>
        </div>
        <p style={{ margin: "0 0 0.5rem", lineHeight: 1.6 }} dir="auto">
          {item.content}
        </p>
        <div className="row" style={{ gap: "0.5rem" }}>
          {!isReply && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => setReplyTo(item)}
              style={{ fontSize: "0.8rem" }}
            >
              ↩ رد
            </button>
          )}
          {isOwn && (
            <button
              className="btn btn-sm btn-ghost"
              onClick={() => remove(item.id)}
              style={{ fontSize: "0.8rem", color: "var(--danger)" }}
            >
              حذف
            </button>
          )}
        </div>
        {item.replies.map((r) => renderItem(r, true))}
      </div>
    );
  }

  return (
    <div className="stack" style={{ marginTop: "2rem" }}>
      <h3 style={{ fontSize: "1rem", marginBottom: "0.8rem" }}>
        💬 الأسئلة والنقاش ({items.length})
      </h3>

      {loading ? (
        <div className="empty small">جارٍ التحميل…</div>
      ) : items.length === 0 ? (
        <div className="empty small">لا يوجد نقاش بعد. كن أول من يسأل!</div>
      ) : (
        items.map((item) => renderItem(item))
      )}

      <form onSubmit={submit} className="card card-flat stack" style={{ gap: "0.5rem" }}>
        {replyTo && (
          <div
            style={{
              fontSize: "0.8rem",
              background: "var(--card-2)",
              borderRadius: 6,
              padding: "0.4rem 0.6rem",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
            }}
          >
            <span className="muted">
              ردّ على: <strong>{replyTo.user_name}</strong>
            </span>
            <button
              type="button"
              className="btn btn-sm btn-ghost"
              onClick={() => setReplyTo(null)}
            >
              ✕
            </button>
          </div>
        )}
        <textarea
          className="input"
          dir="auto"
          rows={3}
          placeholder="اكتب سؤالك أو تعليقك…"
          value={content}
          onChange={(e) => setContent(e.target.value)}
          style={{ resize: "vertical" }}
        />
        {error && <div className="alert alert-error">{error}</div>}
        <div className="row" style={{ justifyContent: "flex-end" }}>
          <button className="btn btn-primary btn-sm" disabled={posting || !content.trim()}>
            {posting ? <span className="spinner" /> : null}
            {posting ? "جارٍ الإرسال…" : "إرسال"}
          </button>
        </div>
      </form>
    </div>
  );
}

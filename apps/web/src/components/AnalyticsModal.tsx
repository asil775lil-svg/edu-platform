/**
 * لوحة تحليلات الطلاب — للمعلم فقط.
 * تعرض إحصائيات الإكمال، أداء كل درس، وتفاصيل كل طالب.
 */
import { useEffect, useState } from "react";
import { api } from "../lib/api";
import type { CourseAnalytics, LessonAnalytics, StudentAnalytics } from "../lib/types";
import { Modal } from "./Modal";

interface Props {
  courseId: string;
  onClose: () => void;
}

function ProgressBar({ value, color = "var(--primary)" }: { value: number; color?: string }) {
  return (
    <div
      style={{
        background: "var(--border)",
        borderRadius: 99,
        height: 8,
        overflow: "hidden",
        flex: 1,
      }}
    >
      <div
        style={{
          width: `${Math.min(100, value)}%`,
          height: "100%",
          background: color,
          borderRadius: 99,
          transition: "width 0.3s",
        }}
      />
    </div>
  );
}

export function AnalyticsModal({ courseId, onClose }: Props) {
  const [data, setData] = useState<CourseAnalytics | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"overview" | "students" | "lessons">("overview");

  useEffect(() => {
    api.analytics
      .course(courseId)
      .then(setData)
      .catch((e) => setError(e.message))
      .finally(() => setLoading(false));
  }, [courseId]);

  const avgColor =
    !data
      ? "var(--primary)"
      : data.average_completion_rate >= 70
        ? "var(--green)"
        : data.average_completion_rate >= 40
          ? "#f59e0b"
          : "var(--danger)";

  function renderStudentCard(s: StudentAnalytics) {
    const color =
      s.completion_rate >= 70
        ? "var(--green)"
        : s.completion_rate >= 40
          ? "#f59e0b"
          : "var(--danger)";
    return (
      <div
        key={s.user_id}
        className="card card-flat"
        style={{ marginBottom: "0.5rem", padding: "0.6rem 0.8rem" }}
      >
        <div className="between" style={{ marginBottom: "0.3rem" }}>
          <div>
            <span style={{ fontWeight: 600 }}>{s.name}</span>
            <span className="small muted" style={{ marginInlineStart: "0.5rem" }}>
              {s.email}
            </span>
          </div>
          <span style={{ fontWeight: 700, color }}>{s.completion_rate}%</span>
        </div>
        <div className="row" style={{ gap: "0.5rem", alignItems: "center" }}>
          <ProgressBar value={s.completion_rate} color={color} />
          <span className="small muted" style={{ whiteSpace: "nowrap" }}>
            {s.completed_lessons}/{s.total_lessons} درس
          </span>
        </div>
        {s.last_activity && (
          <div className="small muted" style={{ marginTop: "0.2rem" }}>
            آخر نشاط:{" "}
            {new Date(s.last_activity).toLocaleDateString("ar-SA", {
              year: "numeric",
              month: "short",
              day: "numeric",
            })}
          </div>
        )}
      </div>
    );
  }

  function renderLessonRow(l: LessonAnalytics) {
    const color =
      l.completion_rate >= 70
        ? "var(--green)"
        : l.completion_rate >= 40
          ? "#f59e0b"
          : "var(--danger)";
    return (
      <tr key={l.lesson_id}>
        <td className="small muted">{l.unit_title}</td>
        <td>{l.title}</td>
        <td style={{ textAlign: "center" }}>{l.completed_by_count}</td>
        <td>
          <div className="row" style={{ gap: "0.4rem", alignItems: "center" }}>
            <ProgressBar value={l.completion_rate} color={color} />
            <span className="small" style={{ color, fontWeight: 600, minWidth: 36 }}>
              {l.completion_rate}%
            </span>
          </div>
        </td>
      </tr>
    );
  }

  return (
    <Modal title="📊 لوحة التحليلات" onClose={onClose}>
      {loading && <div className="empty">جارٍ تحميل البيانات…</div>}
      {error && <div className="alert alert-error">{error}</div>}
      {data && (
        <div className="stack">
          {/* بطاقات الملخص */}
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
              gap: "0.6rem",
            }}
          >
            {[
              { label: "إجمالي المشتركين", value: data.total_enrollments, icon: "👥" },
              { label: "أكملوا المادة", value: data.completed_students, icon: "🎓" },
              { label: "متوسط الإكمال", value: `${data.average_completion_rate}%`, icon: "📈" },
              { label: "ملاحظات مكتوبة", value: data.total_notes, icon: "📝" },
              { label: "نقاشات ومشاركات", value: data.total_discussions, icon: "💬" },
            ].map((card) => (
              <div key={card.label} className="card card-flat" style={{ textAlign: "center" }}>
                <div style={{ fontSize: "1.5rem" }}>{card.icon}</div>
                <div style={{ fontSize: "1.3rem", fontWeight: 700, color: avgColor }}>
                  {card.value}
                </div>
                <div className="small muted">{card.label}</div>
              </div>
            ))}
          </div>

          {/* شريط التبويبات */}
          <div className="row" style={{ gap: "0.3rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.3rem" }}>
            {(["overview", "students", "lessons"] as const).map((t) => (
              <button
                key={t}
                className={`btn btn-sm ${tab === t ? "btn-primary" : "btn-ghost"}`}
                onClick={() => setTab(t)}
              >
                {t === "overview" ? "نظرة عامة" : t === "students" ? "الطلاب" : "الدروس"}
              </button>
            ))}
          </div>

          {/* نظرة عامة */}
          {tab === "overview" && (
            <div>
              <div className="between" style={{ marginBottom: "0.4rem" }}>
                <span className="small muted">معدل إكمال المادة بشكل عام</span>
                <span style={{ fontWeight: 700, color: avgColor }}>
                  {data.average_completion_rate}%
                </span>
              </div>
              <ProgressBar value={data.average_completion_rate} color={avgColor} />
              <div className="small muted" style={{ marginTop: "0.6rem" }}>
                من أصل {data.total_enrollments} مشترك، أكمل {data.completed_students} الدراسة بالكامل.
              </div>
            </div>
          )}

          {/* الطلاب */}
          {tab === "students" && (
            <div style={{ maxHeight: "50vh", overflowY: "auto" }}>
              {data.students.length === 0 ? (
                <div className="empty small">لا يوجد طلاب مشتركون بعد.</div>
              ) : (
                data.students.map(renderStudentCard)
              )}
            </div>
          )}

          {/* الدروس */}
          {tab === "lessons" && (
            <div style={{ overflowX: "auto" }}>
              {data.lessons.length === 0 ? (
                <div className="empty small">لا توجد بيانات دروس بعد.</div>
              ) : (
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.85rem" }}>
                  <thead>
                    <tr style={{ borderBottom: "1px solid var(--border)" }}>
                      <th style={{ textAlign: "right", padding: "0.4rem" }} className="muted">
                        الوحدة
                      </th>
                      <th style={{ textAlign: "right", padding: "0.4rem" }}>الدرس</th>
                      <th style={{ textAlign: "center", padding: "0.4rem" }}>أكمله</th>
                      <th style={{ textAlign: "right", padding: "0.4rem", minWidth: 150 }}>
                        نسبة الإكمال
                      </th>
                    </tr>
                  </thead>
                  <tbody>{data.lessons.map(renderLessonRow)}</tbody>
                </table>
              )}
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}

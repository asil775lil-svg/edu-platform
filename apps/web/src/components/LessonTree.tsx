import { addLesson, addUnit, moveUnit, removeUnit, updateUnit } from "../lib/draft";
import type { CourseDraft } from "../lib/types";

export function LessonTree({
  draft,
  activeId,
  onSelect,
  onChange,
}: {
  draft: CourseDraft;
  activeId: string | null;
  onSelect: (lessonId: string) => void;
  onChange: (next: CourseDraft) => void;
}) {
  return (
    <div className="card card-flat">
      <div className="between" style={{ marginBottom: "0.7rem" }}>
        <strong style={{ fontSize: "0.95rem" }}>هيكل المادة</strong>
        <button className="btn btn-sm" onClick={() => onChange(addUnit(draft))}>
          + وحدة
        </button>
      </div>

      <div className="tree">
        {draft.units.length === 0 && (
          <p className="muted small">لا توجد وحدات. أضف وحدة للبدء.</p>
        )}

        {draft.units.map((unit, unitIndex) => (
          <div className="tree-unit" key={unit.id}>
            <div className="tree-unit-head">
              <input
                value={unit.title}
                onChange={(event) => onChange(updateUnit(draft, unit.id, { title: event.target.value }))}
                style={{
                  background: "transparent",
                  border: "none",
                  outline: "none",
                  fontWeight: 700,
                  width: "100%",
                  color: "inherit",
                }}
                aria-label="اسم الوحدة"
              />
              <div className="row" style={{ gap: "0.15rem" }}>
                <button
                  className="icon-btn"
                  title="أعلى"
                  disabled={unitIndex === 0}
                  onClick={() => onChange(moveUnit(draft, unit.id, -1))}
                >
                  ↑
                </button>
                <button
                  className="icon-btn"
                  title="أسفل"
                  disabled={unitIndex === draft.units.length - 1}
                  onClick={() => onChange(moveUnit(draft, unit.id, 1))}
                >
                  ↓
                </button>
                <button
                  className="icon-btn"
                  title="حذف الوحدة"
                  onClick={() => {
                    if (confirm(`حذف «${unit.title}» وكل دروسها؟`))
                      onChange(removeUnit(draft, unit.id));
                  }}
                >
                  ✕
                </button>
              </div>
            </div>

            {unit.lessons.map((lesson) => (
              <button
                key={lesson.id}
                className={`tree-lesson ${activeId === lesson.id ? "active" : ""}`}
                onClick={() => onSelect(lesson.id)}
              >
                <span>📖 {lesson.title}</span>
                <span className="small muted">{lesson.blocks.length}</span>
              </button>
            ))}

            <button
              className="tree-lesson"
              style={{ color: "#93c5fd" }}
              onClick={() => {
                const next = addLesson(draft, unit.id);
                onChange(next);
                const created = next.units
                  .find((item) => item.id === unit.id)
                  ?.lessons.at(-1);
                if (created) onSelect(created.id);
              }}
            >
              + درس
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

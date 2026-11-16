/**
 * علامة مائية ديناميكية لحماية المحتوى وردع التصوير أو التسريب.
 * تظهر بأسلوب شفاف فوق المحتوى والمشغلات وتحمل اسم الطالب وبريده.
 */
import { useAuth } from "../lib/auth";

export function Watermark({ enabled = true }: { enabled?: boolean }) {
  const { user } = useAuth();
  if (!enabled || !user) return null;

  const text = `${user.name} • ${user.email}`;

  return (
    <div
      aria-hidden="true"
      style={{
        position: "fixed",
        inset: 0,
        pointerEvents: "none",
        zIndex: 9999,
        overflow: "hidden",
        userSelect: "none",
        display: "flex",
        flexWrap: "wrap",
        alignContent: "space-around",
        justifyContent: "space-around",
        opacity: 0.07,
      }}
    >
      {Array.from({ length: 12 }).map((_, i) => (
        <div
          key={i}
          style={{
            transform: "rotate(-25deg)",
            fontSize: "1.1rem",
            fontWeight: 700,
            color: "var(--text)",
            padding: "2rem",
            whiteSpace: "nowrap",
            fontFamily: "monospace",
          }}
        >
          {text}
        </div>
      ))}
    </div>
  );
}

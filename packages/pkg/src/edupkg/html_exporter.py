"""تصدير المنهج كصفحة HTML مستقلة تعمل دون إنترنت أو خادم."""

from __future__ import annotations

import base64
import json
import posixpath
from typing import Any


def export_standalone_html(
    course: dict[str, Any],
    media_files: dict[str, bytes] | None = None,
) -> str:
    """يولّد ملف HTML واحداً ومستقلاً يحتوي على المنهج والقارئ التفاعلي."""
    media = media_files or {}
    course_json = json.dumps(course, ensure_ascii=False)

    # تحويل الوسائط الصغيرة (صور/صوت) إلى Data URLs مدمجة
    media_data_urls: dict[str, str] = {}
    for sha, raw_bytes in media.items():
        # خمن النوع
        if raw_bytes.startswith(b"\x89PNG"):
            mime = "image/png"
        elif raw_bytes.startswith(b"\xff\xd8\xff"):
            mime = "image/jpeg"
        elif raw_bytes.startswith(b"GIF8"):
            mime = "image/gif"
        elif raw_bytes.startswith(b"RIFF") and b"WEBP" in raw_bytes[:16]:
            mime = "image/webp"
        elif raw_bytes.startswith(b"%PDF"):
            mime = "application/pdf"
        elif raw_bytes.startswith((b"ID3", b"\xff\xfb", b"\xff\xf3")):
            mime = "audio/mpeg"
        elif raw_bytes.startswith(b"RIFF") and b"WAVE" in raw_bytes[:16]:
            mime = "audio/wav"
        else:
            mime = "application/octet-stream"

        b64 = base64.b64encode(raw_bytes).decode("ascii")
        media_data_urls[sha] = f"data:{mime};base64,{b64}"

    media_json = json.dumps(media_data_urls, ensure_ascii=False)
    title = course.get("title", "منهج تعليمي")

    return f"""<!DOCTYPE html>
<html lang="ar" dir="rtl">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title} — قارئ بدون إنترنت</title>
<style>
:root {{
  --bg: #0b1220;
  --card: #111a2e;
  --card-2: #17243d;
  --border: #223252;
  --text: #f1f5f9;
  --muted: #94a3b8;
  --primary: #3b82f6;
  --green: #10b981;
  --danger: #ef4444;
  --radius: 12px;
}}
* {{ box-sizing: border-box; }}
body {{
  margin: 0;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Cairo", sans-serif;
  background: var(--bg);
  color: var(--text);
  line-height: 1.6;
}}
header {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.8rem 1.5rem;
  background: rgba(11, 18, 32, 0.95);
  border-bottom: 1px solid var(--border);
  position: sticky;
  top: 0;
  z-index: 10;
}}
.brand {{ font-weight: 800; display: flex; align-items: center; gap: 0.5rem; }}
.badge {{
  display: inline-flex;
  padding: 0.2rem 0.6rem;
  border-radius: 999px;
  font-size: 0.75rem;
  font-weight: 700;
  border: 1px solid var(--border);
}}
.badge-offline {{ background: rgba(16, 185, 129, 0.15); color: #6ee7b7; border-color: rgba(16, 185, 129, 0.35); }}
.badge-tip {{ background: rgba(16, 185, 129, 0.15); color: #6ee7b7; }}
.badge-info {{ background: rgba(59, 130, 246, 0.15); color: #93c5fd; }}
.badge-warning {{ background: rgba(245, 158, 11, 0.15); color: #fcd34d; }}
.badge-danger {{ background: rgba(239, 68, 68, 0.15); color: #fca5a5; }}

.container {{
  display: grid;
  grid-template-columns: 320px 1fr;
  min-height: calc(100vh - 60px);
}}
@media (max-width: 860px) {{
  .container {{ grid-template-columns: 1fr; }}
}}
aside {{
  border-inline-end: 1px solid var(--border);
  background: var(--card);
  padding: 1.2rem;
  overflow-y: auto;
  max-height: calc(100vh - 60px);
}}
main {{
  padding: 1.8rem 2.2rem 5rem;
  max-width: 900px;
}}
.unit-title {{
  font-size: 0.82rem;
  text-transform: uppercase;
  color: var(--muted);
  margin-top: 1.2rem;
  margin-bottom: 0.4rem;
  font-weight: 700;
}}
.lesson-item {{
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0.55rem 0.75rem;
  border-radius: 8px;
  cursor: pointer;
  margin-bottom: 0.25rem;
  transition: 0.15s;
}}
.lesson-item:hover {{ background: var(--card-2); }}
.lesson-item.active {{ background: rgba(59, 130, 246, 0.18); color: #93c5fd; font-weight: 700; }}
.btn {{
  display: inline-flex;
  align-items: center;
  gap: 0.4rem;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  border: 1px solid var(--border);
  background: var(--card-2);
  color: var(--text);
  cursor: pointer;
  font-weight: 600;
}}
.btn-primary {{ background: var(--primary); border-color: var(--primary); color: #fff; }}
.btn:hover {{ border-color: var(--primary); }}
.progressbar {{
  height: 8px;
  background: var(--border);
  border-radius: 999px;
  overflow: hidden;
  margin: 0.5rem 0 1rem;
}}
.progressbar span {{ display: block; height: 100%; background: var(--green); transition: width 0.3s; }}
.card {{
  background: var(--card);
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 1.2rem;
  margin: 1.2rem 0;
}}
.callout {{
  border-inline-start: 4px solid var(--primary);
  border-radius: 10px;
  padding: 0.85rem 1.1rem;
  margin: 1.2rem 0;
  background: rgba(23, 36, 61, 0.45);
}}
.callout-tip {{ border-inline-start-color: var(--green); }}
.callout-info {{ border-inline-start-color: var(--primary); }}
.callout-warning {{ border-inline-start-color: #f59e0b; }}
.callout-danger {{ border-inline-start-color: var(--danger); }}

pre, code {{ font-family: Consolas, monospace; unicode-bidi: isolate; }}
pre {{
  background: #0d1527;
  padding: 0.9rem;
  border-radius: 8px;
  overflow-x: auto;
  direction: ltr;
  text-align: left;
  border: 1px solid var(--border);
}}
img, video, audio {{ max-width: 100%; border-radius: 8px; }}
.quiz-choice {{
  display: block;
  width: 100%;
  text-align: start;
  margin: 0.35rem 0;
  padding: 0.65rem 0.9rem;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--card-2);
  cursor: pointer;
  color: var(--text);
}}
.quiz-choice.correct {{ border-color: var(--green); background: rgba(16, 185, 129, 0.15); }}
.quiz-choice.wrong {{ border-color: var(--danger); background: rgba(239, 68, 68, 0.15); }}
</style>
</head>
<body>
<header>
  <div class="brand">
    <span>📖</span>
    <span>{title}</span>
    <span class="badge badge-offline">أوفلاين بدون إنترنت</span>
  </div>
  <div id="progress-info" style="font-size: 0.85rem; color: var(--muted);"></div>
</header>

<div class="container">
  <aside id="sidebar"></aside>
  <main id="content"></main>
</div>

<script>
const course = {course_json};
const mediaUrls = {media_json};
const storageKey = "edupkg_offline_progress_" + (course.id || "c1");

let progress = JSON.parse(localStorage.getItem(storageKey) || "{{}}");
let activeLessonId = null;

// مسطّح الدروس
const allLessons = [];
(course.units || []).forEach(unit => {{
  (unit.lessons || []).forEach(l => allLessons.push(l));
}});

if (allLessons.length > 0) {{
  activeLessonId = allLessons[0].id;
}}

function saveProgress() {{
  localStorage.setItem(storageKey, JSON.stringify(progress));
  renderSidebar();
}}

function renderSidebar() {{
  const sidebar = document.getElementById("sidebar");
  sidebar.innerHTML = "";

  const completedCount = Object.values(progress).filter(p => p.status === "completed").length;
  const pct = allLessons.length ? Math.round((completedCount / allLessons.length) * 100) : 0;

  document.getElementById("progress-info").textContent = `${{completedCount}} / ${{allLessons.length}} درس مكتمل (${{pct}}%)`;

  const bar = document.createElement("div");
  bar.className = "progressbar";
  bar.innerHTML = `<span style="width: ${{pct}}%"></span>`;
  sidebar.appendChild(bar);

  (course.units || []).forEach(unit => {{
    const title = document.createElement("div");
    title.className = "unit-title";
    title.textContent = unit.title || "وحدة";
    sidebar.appendChild(title);

    (unit.lessons || []).forEach(lesson => {{
      const item = document.createElement("div");
      item.className = "lesson-item" + (lesson.id === activeLessonId ? " active" : "");
      const isDone = progress[lesson.id]?.status === "completed";
      item.innerHTML = `<span>${{lesson.title || "درس"}}</span> <span>${{isDone ? "✓" : ""}}</span>`;
      item.onclick = () => {{
        activeLessonId = lesson.id;
        renderSidebar();
        renderContent();
      }};
      sidebar.appendChild(item);
    }});
  }});
}}

function renderContent() {{
  const main = document.getElementById("content");
  main.innerHTML = "";

  const lesson = allLessons.find(l => l.id === activeLessonId);
  if (!lesson) {{
    main.innerHTML = "<p>اختر درساً من القائمة الجانبية.</p>";
    return;
  }}

  const h1 = document.createElement("h1");
  h1.textContent = lesson.title;
  h1.dir = "auto";
  main.appendChild(h1);

  (lesson.blocks || []).forEach(block => {{
    if (block.type === "heading") {{
      const h2 = document.createElement("h2");
      h2.textContent = block.text || "";
      h2.dir = "auto";
      main.appendChild(h2);
    }} else if (block.type === "text") {{
      const div = document.createElement("div");
      div.dir = "auto";
      div.style.margin = "1rem 0";
      // فك نص مبسط من TipTap Doc
      div.innerHTML = renderProse(block.doc);
      main.appendChild(div);
    }} else if (block.type === "callout") {{
      const box = document.createElement("div");
      const v = block.calloutVariant || "tip";
      box.className = "callout callout-" + v;
      box.innerHTML = `<strong>${{block.calloutTitle || "ملاحظة"}}</strong><p style="margin: 0.35rem 0 0;" dir="auto">${{block.text || ""}}</p>`;
      main.appendChild(box);
    }} else if (block.type === "image") {{
      const url = mediaUrls[block.assetSha256];
      if (url) {{
        const img = document.createElement("img");
        img.src = url;
        img.alt = block.alt || "";
        main.appendChild(img);
      }}
    }} else if (block.type === "audio") {{
      const url = mediaUrls[block.assetSha256];
      if (url) {{
        const aud = document.createElement("audio");
        aud.src = url;
        aud.controls = true;
        main.appendChild(aud);
      }}
    }} else if (block.type === "quiz") {{
      const card = document.createElement("div");
      card.className = "card";
      card.innerHTML = `<span class="badge badge-warning">سؤال تفاعلي</span><h3 dir="auto">${{block.question || ""}}</h3>`;
      const choices = block.choices || [];
      choices.forEach((c, idx) => {{
        const btn = document.createElement("button");
        btn.className = "quiz-choice";
        btn.textContent = c;
        btn.dir = "auto";
        btn.onclick = () => {{
          card.querySelectorAll(".quiz-choice").forEach((b, i) => {{
            b.disabled = true;
            if (i === (block.answerIndex ?? 0)) b.classList.add("correct");
            else if (i === idx) b.classList.add("wrong");
          }});
        }};
        card.appendChild(btn);
      }});
      main.appendChild(card);
    }}
  }});

  // زر إكمال الدرس
  const doneBtn = document.createElement("button");
  const isDone = progress[lesson.id]?.status === "completed";
  doneBtn.className = "btn " + (isDone ? "" : "btn-primary");
  doneBtn.textContent = isDone ? "✓ تم إكمال هذا الدرس" : "تحديد كمكتمل";
  doneBtn.style.marginTop = "2rem";
  doneBtn.onclick = () => {{
    progress[lesson.id] = {{ status: "completed" }};
    saveProgress();
    renderContent();
  }};
  main.appendChild(doneBtn);
}}

function renderProse(doc) {{
  if (!doc || !doc.content) return "";
  let html = "";
  doc.content.forEach(node => {{
    if (node.type === "paragraph") {{
      let inner = "";
      (node.content || []).forEach(c => {{
        let txt = c.text || "";
        if (c.marks) {{
          c.marks.forEach(m => {{
            if (m.type === "bold") txt = `<strong>${{txt}}</strong>`;
            if (m.type === "italic") txt = `<em>${{txt}}</em>`;
            if (m.type === "code") txt = `<code>${{txt}}</code>`;
          }});
        }}
        inner += txt;
      }});
      html += `<p dir="auto">${{inner}}</p>`;
    }} else if (node.type === "codeBlock") {{
      let code = "";
      (node.content || []).forEach(c => code += c.text || "");
      html += `<pre dir="ltr"><code>${{code}}</code></pre>`;
    }}
  }});
  return html;
}}

renderSidebar();
renderContent();
</script>
</body>
</html>"""

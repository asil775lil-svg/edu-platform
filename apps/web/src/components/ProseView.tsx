import type { ReactNode } from "react";
import type { ProseDoc } from "../lib/types";

interface Mark {
  type: string;
  attrs?: Record<string, unknown>;
}

interface Node {
  type?: string;
  text?: string;
  attrs?: Record<string, unknown>;
  marks?: Mark[];
  content?: Node[];
}

const SAFE_PROTOCOLS = ["http:", "https:", "mailto:"];

/** لا نثق في روابط المستند: نقبل http(s) وmailto فقط ونرفض javascript: وغيرها. */
function safeHref(raw: unknown): string | null {
  if (typeof raw !== "string" || !raw.trim()) return null;
  try {
    const url = new URL(raw, window.location.origin);
    return SAFE_PROTOCOLS.includes(url.protocol) ? raw : null;
  } catch {
    return null;
  }
}

function renderChildren(node: Node): ReactNode {
  return (node.content ?? []).map((child, index) => renderNode(child, index));
}

function renderNode(node: Node, key: number): ReactNode {
  const children = renderChildren(node);

  switch (node.type) {
    case "doc":
      return <div key={key}>{children}</div>;
    // dir="auto" يجعل اتجاه كل فقرة يتبع أول حرف قوي فيها، فلا ينقلب نص
    // إنجليزي أو كود داخل صفحة عربية.
    case "paragraph":
      return (
        <p key={key} dir="auto">
          {children}
        </p>
      );
    case "heading": {
      const level = Number(node.attrs?.level ?? 2);
      return level >= 3 ? (
        <h3 key={key} dir="auto">
          {children}
        </h3>
      ) : (
        <h2 key={key} dir="auto">
          {children}
        </h2>
      );
    }
    case "bulletList":
      return <ul key={key}>{children}</ul>;
    case "orderedList":
      return <ol key={key}>{children}</ol>;
    case "listItem":
      return (
        <li key={key} dir="auto">
          {children}
        </li>
      );
    case "blockquote":
      return (
        <blockquote key={key} dir="auto">
          {children}
        </blockquote>
      );
    case "codeBlock":
      return (
        <pre key={key} dir="ltr">
          <code>{children}</code>
        </pre>
      );
    case "hardBreak":
      return <br key={key} />;
    case "horizontalRule":
      return <hr key={key} />;
    case "text": {
      let output: ReactNode = node.text ?? "";
      for (const mark of node.marks ?? []) {
        if (mark.type === "bold") output = <strong>{output}</strong>;
        else if (mark.type === "italic") output = <em>{output}</em>;
        else if (mark.type === "code") output = <code>{output}</code>;
        else if (mark.type === "link") {
          const href = safeHref(mark.attrs?.href);
          if (href) {
            output = (
              <a href={href} target="_blank" rel="noopener noreferrer nofollow">
                {output}
              </a>
            );
          }
        }
      }
      return <span key={key}>{output}</span>;
    }
    default:
      return <span key={key}>{children}</span>;
  }
}

/** عرض آمن لمستند ProseMirror دون HTML خام. */
export function ProseView({ doc }: { doc: ProseDoc | undefined }) {
  if (!doc) return null;
  return <div className="prose prose-read">{renderNode(doc as unknown as Node, 0)}</div>;
}

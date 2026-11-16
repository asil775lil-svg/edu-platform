import { Placeholder } from "@tiptap/extension-placeholder";
import type { JSONContent } from "@tiptap/core";
import { EditorContent, useEditor } from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import { useEffect } from "react";
import type { ProseDoc } from "../lib/types";

export function RichText({
  value,
  onChange,
  resetKey,
  placeholder = "اكتب المحتوى…",
}: {
  value: ProseDoc | undefined;
  onChange: (doc: ProseDoc) => void;
  resetKey?: string;
  placeholder?: string;
}) {
  const editor = useEditor({
    extensions: [StarterKit, Placeholder.configure({ placeholder })],
    content: (value ?? { type: "doc", content: [{ type: "paragraph" }] }) as JSONContent,
    editorProps: {
      attributes: { class: "prose", dir: "rtl", spellcheck: "false" },
    },
    onUpdate: ({ editor: instance }) => {
      onChange(instance.getJSON() as unknown as ProseDoc);
    },
  });

  useEffect(() => {
    if (!editor) return;
    const current = JSON.stringify(editor.getJSON());
    const incoming = JSON.stringify(value ?? { type: "doc" });
    if (current !== incoming) {
      editor.commands.setContent((value ?? { type: "doc", content: [] }) as JSONContent);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [editor, resetKey]);

  if (!editor) return null;

  return (
    <>
      <div className="toolbar">
        <button
          type="button"
          className={editor.isActive("bold") ? "on" : ""}
          onClick={() => editor.chain().focus().toggleBold().run()}
          title="عريض"
        >
          <strong>B</strong>
        </button>
        <button
          type="button"
          className={editor.isActive("italic") ? "on" : ""}
          onClick={() => editor.chain().focus().toggleItalic().run()}
          title="مائل"
        >
          <em>I</em>
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 2 }) ? "on" : ""}
          onClick={() => editor.chain().focus().toggleHeading({ level: 2 }).run()}
        >
          H2
        </button>
        <button
          type="button"
          className={editor.isActive("heading", { level: 3 }) ? "on" : ""}
          onClick={() => editor.chain().focus().toggleHeading({ level: 3 }).run()}
        >
          H3
        </button>
        <button
          type="button"
          className={editor.isActive("bulletList") ? "on" : ""}
          onClick={() => editor.chain().focus().toggleBulletList().run()}
          title="قائمة"
        >
          ••
        </button>
        <button
          type="button"
          className={editor.isActive("orderedList") ? "on" : ""}
          onClick={() => editor.chain().focus().toggleOrderedList().run()}
          title="قائمة مرقّمة"
        >
          1.
        </button>
        <button
          type="button"
          className={editor.isActive("blockquote") ? "on" : ""}
          onClick={() => editor.chain().focus().toggleBlockquote().run()}
          title="اقتباس"
        >
          ”
        </button>
        <button
          type="button"
          className={editor.isActive("code") ? "on" : ""}
          onClick={() => editor.chain().focus().toggleCode().run()}
          title="كود"
        >
          {"</>"}
        </button>
      </div>
      <EditorContent editor={editor} />
    </>
  );
}

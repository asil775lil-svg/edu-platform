import { newId } from "./api";
import type { Block, BlockType, CourseDraft, Lesson, Unit } from "./types";

export function addUnit(draft: CourseDraft): CourseDraft {
  const unit: Unit = {
    id: newId("unit"),
    title: `الوحدة ${draft.units.length + 1}`,
    order: draft.units.length,
    lessons: [],
  };
  return { ...draft, units: [...draft.units, unit] };
}

export function addLesson(draft: CourseDraft, unitId: string): CourseDraft {
  return {
    ...draft,
    units: draft.units.map((unit) => {
      if (unit.id !== unitId) return unit;
      const lesson: Lesson = {
        id: newId("les"),
        title: `الدرس ${unit.lessons.length + 1}`,
        order: unit.lessons.length,
        blocks: [],
      };
      return { ...unit, lessons: [...unit.lessons, lesson] };
    }),
  };
}

export function updateUnit(draft: CourseDraft, unitId: string, patch: Partial<Unit>): CourseDraft {
  return {
    ...draft,
    units: draft.units.map((unit) => (unit.id === unitId ? { ...unit, ...patch } : unit)),
  };
}

export function removeUnit(draft: CourseDraft, unitId: string): CourseDraft {
  return { ...draft, units: draft.units.filter((unit) => unit.id !== unitId) };
}

export function updateLesson(
  draft: CourseDraft,
  lessonId: string,
  updater: (lesson: Lesson) => Lesson,
): CourseDraft {
  return {
    ...draft,
    units: draft.units.map((unit) => ({
      ...unit,
      lessons: unit.lessons.map((lesson) =>
        lesson.id === lessonId ? updater(lesson) : lesson,
      ),
    })),
  };
}

export function removeLesson(draft: CourseDraft, lessonId: string): CourseDraft {
  return {
    ...draft,
    units: draft.units.map((unit) => ({
      ...unit,
      lessons: unit.lessons.filter((lesson) => lesson.id !== lessonId),
    })),
  };
}

export function moveLesson(draft: CourseDraft, lessonId: string, delta: number): CourseDraft {
  return {
    ...draft,
    units: draft.units.map((unit) => {
      const index = unit.lessons.findIndex((lesson) => lesson.id === lessonId);
      if (index === -1) return unit;
      const target = index + delta;
      if (target < 0 || target >= unit.lessons.length) return unit;
      const lessons = [...unit.lessons];
      [lessons[index], lessons[target]] = [lessons[target], lessons[index]];
      return { ...unit, lessons: lessons.map((lesson, order) => ({ ...lesson, order })) };
    }),
  };
}

export function findLesson(draft: CourseDraft, lessonId: string): Lesson | null {
  for (const unit of draft.units) {
    const lesson = unit.lessons.find((item) => item.id === lessonId);
    if (lesson) return lesson;
  }
  return null;
}

export function defaultBlock(type: BlockType): Block {
  const id = newId("blk");
  switch (type) {
    case "heading":
      return { id, type, level: 2, text: "عنوان جديد" };
    case "text":
      return {
        id,
        type,
        doc: { type: "doc", content: [{ type: "paragraph" }] },
      };
    case "quiz":
      return {
        id,
        type,
        question: "اكتب السؤال هنا",
        choices: ["الخيار الأول", "الخيار الثاني"],
        answerIndex: 0,
      };
    case "video":
      return { id, type, assetSha256: "", caption: "" };
    case "audio":
      return { id, type, assetSha256: "", caption: "" };
    case "image":
      return { id, type, assetSha256: "", alt: "" };
    default:
      return { id, type: "text" };
  }
}

export function moveBlock(lesson: Lesson, blockId: string, delta: number): Lesson {
  const index = lesson.blocks.findIndex((block) => block.id === blockId);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= lesson.blocks.length) return lesson;
  const blocks = [...lesson.blocks];
  [blocks[index], blocks[target]] = [blocks[target], blocks[index]];
  return { ...lesson, blocks: blocks.map((block, order) => ({ ...block, order })) };
}

export function moveUnit(draft: CourseDraft, unitId: string, delta: number): CourseDraft {
  const index = draft.units.findIndex((unit) => unit.id === unitId);
  const target = index + delta;
  if (index === -1 || target < 0 || target >= draft.units.length) return draft;
  const units = [...draft.units];
  [units[index], units[target]] = [units[target], units[index]];
  return { ...draft, units: units.map((unit, order) => ({ ...unit, order })) };
}

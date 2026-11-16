export type Role = "teacher" | "student";

export interface User {
  id: string;
  email: string;
  name: string;
  role: Role;
  public_key?: string | null;
}

export interface CourseSummary {
  id: string;
  title: string;
  description: string;
  owner_id: string;
  published_version_id: string | null;
  unit_count: number;
  lesson_count: number;
  updated_at: string;
}

export type BlockType = "heading" | "text" | "image" | "video" | "audio" | "quiz" | "callout";

export type CalloutVariant = "info" | "warning" | "tip" | "danger";

export interface ProseDoc {
  type: "doc";
  content?: unknown[];
}

export interface Block {
  id: string;
  type: BlockType;
  order?: number;
  text?: string;
  level?: number;
  doc?: ProseDoc;
  assetSha256?: string;
  alt?: string;
  caption?: string;
  durationSec?: number;
  question?: string;
  choices?: string[];
  answerIndex?: number;
  calloutVariant?: CalloutVariant;
  calloutTitle?: string;
}

export interface Lesson {
  id: string;
  title: string;
  order: number;
  blocks: Block[];
}

export interface Unit {
  id: string;
  title: string;
  order: number;
  lessons: Lesson[];
}

export interface CourseDraft {
  schemaVersion?: number;
  id?: string;
  title: string;
  description: string;
  versionSeq?: number;
  units: Unit[];
}

export interface CourseDetail extends CourseSummary {
  draft: CourseDraft;
}

export interface AssetInfo {
  id: string;
  sha256: string;
  ext: string;
  mime: string;
  size: number;
  url: string;
  deduplicated: boolean;
}

export interface VersionInfo {
  id: string;
  seq: number;
  created_at: string;
  counts: Record<string, number>;
}

export interface LibraryItem {
  course_id: string;
  title: string;
  description: string;
  version_id: string | null;
  total_lessons: number;
  completed_lessons: number;
  has_update: boolean;
}

export interface CatalogItem {
  course_id: string;
  title: string;
  description: string;
  teacher_name: string;
  total_lessons: number;
  is_enrolled: boolean;
  published_at: string;
}

export interface Note {
  id: string;
  lesson_id: string;
  body: string;
  anchor: Record<string, unknown>;
  updated_at: string;
}

export interface ProgressRow {
  lesson_id: string;
  status: "not_started" | "in_progress" | "completed";
  position: number;
}

export interface LibraryCourse {
  id: string;
  title: string;
  description: string;
  version: { id: string; seq: number };
  snapshot: CourseDraft;
  progress: ProgressRow[];
  notes: Note[];
}

export interface PackageJob {
  id: string;
  kind: "export" | "import";
  status: "pending" | "running" | "done" | "failed";
  meta: Record<string, unknown>;
  error: string | null;
  download_url: string | null;
  created_at: string;
}

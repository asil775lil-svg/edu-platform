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

export type BlockType =
  | "heading"
  | "text"
  | "image"
  | "video"
  | "audio"
  | "quiz"
  | "callout"
  | "code"
  | "math"
  | "divider"
  | "table";export type CalloutVariant = "info" | "warning" | "tip" | "danger";

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
  explanation?: string;
  calloutVariant?: CalloutVariant;

  calloutTitle?: string;
  // كتلة كود
  code?: string;
  language?: string;
  // كتلة معادلة رياضية
  latex?: string;
  displayMode?: boolean;
  // كتلة جدول
  tableCaption?: string;
  tableHeaders?: string[];
  tableRows?: string[][];
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

// --- مناقشات وأسئلة Q&A ---
export interface DiscussionItem {
  id: string;
  course_id: string;
  lesson_id: string;
  user_id: string;
  user_name: string;
  user_role: string;
  content: string;
  parent_id: string | null;
  created_at: string;
  replies: DiscussionItem[];
}

// --- تحليلات المعلم ---
export interface StudentAnalytics {
  user_id: string;
  name: string;
  email: string;
  completed_lessons: number;
  total_lessons: number;
  completion_rate: number;
  enrolled_at: string;
  last_activity: string | null;
}

export interface LessonAnalytics {
  lesson_id: string;
  title: string;
  unit_title: string;
  completed_by_count: number;
  completion_rate: number;
}

export interface CourseAnalytics {
  course_id: string;
  title: string;
  total_enrollments: number;
  completed_students: number;
  average_completion_rate: number;
  total_notes: number;
  total_discussions: number;
  students: StudentAnalytics[];
  lessons: LessonAnalytics[];
}

// --- نتيجة الذكاء الاصطناعي ---
export interface GeneratedQuiz {
  type: string;
  questionType: string;
  question: string;
  choices: string[];
  answerIndex: number;
  explanation: string;
}

export interface AiResult {
  action: string;
  result: {
    quizzes?: GeneratedQuiz[];
    summary?: string;
    key_points?: string[];
    explanation?: string;
    tips?: string[];
  };
  source: string;
}

// --- أنواع كتل موسّعة ---
// (تم توسيعها ضمن BlockType أعلاه، هذا السطر محجوز)

// --- الخزن وحفظ الملفات المستوردة لجميع الصيغ ---
export interface VaultFile {
  id: string;
  vault_id: string;
  user_id: string;
  filename: string;
  original_name: string;
  ext: string;
  mime: string;
  size: number;
  sha256: string;
  source_type: "external_url" | "upload" | "api";
  source_url: string | null;
  description: string | null;
  folder?: string | null;
  tags?: string[];
  metadata_info: Record<string, unknown>;
  created_at: string;
  updated_at: string;
  download_url: string;
  view_url: string;
}

export interface Vault {
  id: string;
  name: string;
  description: string;
  icon: string;
  user_id: string;
  file_count: number;
  total_size: number;
  created_at: string;
  updated_at: string;
}

export interface VaultDetail extends Vault {
  files: VaultFile[];
  folders: string[];
  all_tags: string[];
}

export interface VaultFileInspect {
  id: string;
  filename: string;
  ext: string;
  mime: string;
  size: number;
  sha256: string;
  download_url: string;
  view_url: string;
  source_type: string;
  source_url: string | null;
  description: string | null;
  folder?: string | null;
  tags?: string[];
  created_at: string;
  preview_data: {
    kind: "pdf" | "docx" | "slides" | "spreadsheet" | "archive" | "code" | "media" | "image" | "database" | "binary";
    language?: string;
    content?: string;
    line_count?: number;
    blocks?: Array<{
      type: "heading" | "paragraph" | "table" | "error";
      level?: number;
      text?: string;
      rows?: string[][];
    }>;
    slides?: Array<{
      slide_number: number;
      title: string;
      content: string[];
      all_text: string[];
    }>;
    slide_count?: number;
    sheets?: Array<{ name: string; rows: string[][] }>;
    file_count?: number;
    total_uncompressed?: number;
    files?: Array<{
      path: string;
      size: number;
      compress_size?: number;
      is_dir: boolean;
      ext: string;
    }>;
    tables?: Array<{
      name: string;
      columns: string[];
      row_count: number;
      sample: string[][];
    }>;
    media_type?: "video" | "audio";
    hex_dump?: string[];
    ascii_dump?: string[];
    error?: string;
  };
}




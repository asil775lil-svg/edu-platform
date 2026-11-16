import type {
  AssetInfo,
  CourseDetail,
  CourseSummary,
  LibraryCourse,
  LibraryItem,
  Note,
  PackageJob,
  Unit,
  User,
  VersionInfo,
} from "./types";

const BASE = "/api";

export class ApiError extends Error {
  status: number;
  detail: unknown;

  constructor(status: number, message: string, detail: unknown) {
    super(message);
    this.status = status;
    this.detail = detail;
  }
}

function messageFrom(detail: unknown, fallback: string): string {
  if (typeof detail === "string") return detail;
  if (detail && typeof detail === "object" && "message" in detail) {
    return String((detail as { message: unknown }).message);
  }
  if (Array.isArray(detail) && detail[0]?.msg) return String(detail[0].msg);
  return fallback;
}

async function request<T>(path: string, init: RequestInit = {}): Promise<T> {
  const isForm = init.body instanceof FormData;
  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: isForm ? {} : { "Content-Type": "application/json", ...(init.headers || {}) },
    ...init,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(
      response.status,
      messageFrom(data?.detail, "حدث خطأ غير متوقع"),
      data?.detail,
    );
  }
  return data as T;
}

export const api = {
  register: (body: { email: string; password: string; name: string; role: string }) =>
    request<User>("/auth/register", { method: "POST", body: JSON.stringify(body) }),
  login: (body: { email: string; password: string }) =>
    request<User>("/auth/login", { method: "POST", body: JSON.stringify(body) }),
  logout: () => request<void>("/auth/logout", { method: "POST" }),
  me: () => request<User>("/auth/me"),

  courses: {
    list: () => request<CourseSummary[]>("/courses"),
    create: (body: { title: string; description?: string }) =>
      request<CourseDetail>("/courses", { method: "POST", body: JSON.stringify(body) }),
    get: (id: string) => request<CourseDetail>(`/courses/${id}`),
    update: (
      id: string,
      body: {
        title?: string;
        description?: string;
        draft?: unknown;
        expected_updated_at?: string;
      },
    ) =>
      request<CourseDetail>(`/courses/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    remove: (id: string) => request<void>(`/courses/${id}`, { method: "DELETE" }),
    publish: (id: string) => request<VersionInfo>(`/courses/${id}/publish`, { method: "POST" }),
    versions: (id: string) => request<VersionInfo[]>(`/courses/${id}/versions`),
  },

  assets: {
    upload: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<AssetInfo>("/assets", { method: "POST", body: form });
    },
    get: (sha256: string) => request<AssetInfo>(`/assets/${sha256}`),
  },

  library: {
    list: () => request<LibraryItem[]>("/library"),
    enroll: (course_id: string) =>
      request<{ enrollment_id: string; already: boolean }>("/library/enroll", {
        method: "POST",
        body: JSON.stringify({ course_id }),
      }),
    get: (id: string) => request<LibraryCourse>(`/library/${id}`),
    setProgress: (id: string, lessonId: string, status: string, position = 0) =>
      request<void>(`/library/${id}/progress/${lessonId}`, {
        method: "PUT",
        body: JSON.stringify({ status, position }),
      }),
    notes: {
      list: (id: string) => request<Note[]>(`/library/${id}/notes`),
      add: (id: string, lesson_id: string, body: string) =>
        request<Note>(`/library/${id}/notes`, {
          method: "POST",
          body: JSON.stringify({ lesson_id, body, anchor: {} }),
        }),
      remove: (id: string, noteId: string) =>
        request<void>(`/library/${id}/notes/${noteId}`, { method: "DELETE" }),
    },
  },

  packages: {
    export: (body: {
      course_id: string;
      protection: string;
      invite_code?: string;
    }) => request<PackageJob>("/packages/export", { method: "POST", body: JSON.stringify(body) }),
    import: (file: File, inviteCode?: string) => {
      const form = new FormData();
      form.append("file", file);
      if (inviteCode) form.append("invite_code", inviteCode);
      return request<PackageJob>("/packages/import", { method: "POST", body: form });
    },
    get: (id: string) => request<PackageJob>(`/packages/${id}`),
    commit: (id: string, body: { invite_code?: string; title?: string }) =>
      request<{ course_id: string; job: PackageJob }>(`/packages/${id}/commit`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
  },
};

/** استطلاع حالة عملية حتى تنتهي. */
export async function waitForJob(
  id: string,
  onTick?: (job: PackageJob) => void,
  timeoutMs = 120_000,
): Promise<PackageJob> {
  const started = Date.now();
  for (;;) {
    const job = await api.packages.get(id);
    onTick?.(job);
    if (job.status === "done" || job.status === "failed") return job;
    if (Date.now() - started > timeoutMs) throw new Error("انتهت مهلة العملية");
    await new Promise((resolve) => setTimeout(resolve, 400));
  }
}

export function newId(prefix: string): string {
  const uuid =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().replace(/-/g, "")
      : Math.random().toString(16).slice(2) + Date.now().toString(16);
  return `${prefix}_${uuid.slice(0, 20)}`;
}

export function emptyUnit(order: number): Unit {
  return { id: newId("unit"), title: `الوحدة ${order + 1}`, order, lessons: [] };
}

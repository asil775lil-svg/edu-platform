import type {
  AdminUser,
  AiResult,
  AssetInfo,
  CatalogItem,
  CourseAnalytics,
  CourseDetail,
  CourseSummary,
  DiscussionItem,
  LibraryCourse,
  LibraryItem,
  Note,
  PackageJob,
  Unit,
  User,
  Vault,
  VaultDetail,
  VaultFile,
  VaultFileInspect,
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
  const token = typeof window !== "undefined" ? localStorage.getItem("edu_token") : null;
  const authHeaders: Record<string, string> = token ? { Authorization: `Bearer ${token}` } : {};

  const response = await fetch(`${BASE}${path}`, {
    credentials: "include",
    headers: isForm
      ? { ...authHeaders, ...(init.headers || {}) }
      : { "Content-Type": "application/json", ...authHeaders, ...(init.headers || {}) },
    ...init,
  });

  if (response.status === 204) return undefined as T;

  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    if (response.status === 401 && typeof window !== "undefined") {
      // Do not clear immediately on single 401 to avoid race conditions, but clear if me() failed
      if (path === "/auth/me") {
        localStorage.removeItem("edu_token");
      }
    }
    throw new ApiError(
      response.status,
      messageFrom(data?.detail, "حدث خطأ غير متوقع"),
      data?.detail,
    );
  }
  return data as T;
}

export const api = {
  register: async (body: { email: string; password: string; name: string; role: string }) => {
    const res = await request<User>("/auth/register", { method: "POST", body: JSON.stringify(body) });
    if (res?.token) localStorage.setItem("edu_token", res.token);
    return res;
  },
  login: async (body: { login?: string; email?: string; password: string }) => {
    const res = await request<User>("/auth/login", { method: "POST", body: JSON.stringify(body) });
    if (res?.token) localStorage.setItem("edu_token", res.token);
    return res;
  },
  firebaseLogin: async (body: { id_token: string; role?: string; name?: string }) => {
    const res = await request<User>("/auth/firebase", { method: "POST", body: JSON.stringify(body) });
    if (res?.token) localStorage.setItem("edu_token", res.token);
    return res;
  },
  logout: async () => {
    localStorage.removeItem("edu_token");
    return request<void>("/auth/logout", { method: "POST" });
  },
  me: () => request<User>("/auth/me"),
  updateProfile: (body: {
    name?: string;
    email?: string;
    current_password?: string;
    new_password?: string;
  }) => request<User>("/auth/profile", { method: "PATCH", body: JSON.stringify(body) }),

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
    fork: (id: string) =>
      request<CourseDetail>(`/courses/${id}/fork`, { method: "POST" }),
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
    catalog: () => request<CatalogItem[]>("/library/catalog"),
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

  discussions: {
    list: (courseId: string, lessonId: string) =>
      request<DiscussionItem[]>(`/courses/${courseId}/lessons/${lessonId}/discussions`),
    post: (courseId: string, lessonId: string, content: string, parentId?: string) =>
      request<DiscussionItem>(`/courses/${courseId}/lessons/${lessonId}/discussions`, {
        method: "POST",
        body: JSON.stringify({ content, parent_id: parentId }),
      }),
    remove: (courseId: string, discussionId: string) =>
      request<void>(`/courses/${courseId}/discussions/${discussionId}`, { method: "DELETE" }),
  },

  ai: {
    generate: (body: {
      action: "generate_quiz" | "summarize" | "explain";
      text: string;
      lesson_title?: string;
      course_id?: string;
    }) => request<AiResult>("/ai/generate", { method: "POST", body: JSON.stringify(body) }),
  },

  analytics: {
    course: (courseId: string) => request<CourseAnalytics>(`/courses/${courseId}/analytics`),
  },

  smartImport: {
    markdown: (title: string, markdownContent: string) =>
      request<CourseDetail>("/courses/import-smart", {
        method: "POST",
        body: JSON.stringify({ title, markdown_content: markdownContent }),
      }),
    zip: (file: File) => {
      const form = new FormData();
      form.append("file", file);
      return request<CourseDetail>("/courses/import-zip", { method: "POST", body: form });
    },
  },

  vaults: {
    list: () => request<Vault[]>("/vaults"),
    create: (body: { name: string; description?: string; icon?: string }) =>
      request<Vault>("/vaults", { method: "POST", body: JSON.stringify(body) }),
    get: (
      id: string,
      params?: { q?: string; category?: string; folder?: string; tag?: string },
    ) => {
      const q = new URLSearchParams();
      if (params?.q) q.set("q", params.q);
      if (params?.category) q.set("category", params.category);
      if (params?.folder) q.set("folder", params.folder);
      if (params?.tag) q.set("tag", params.tag);
      const queryStr = q.toString() ? `?${q.toString()}` : "";
      return request<VaultDetail>(`/vaults/${id}${queryStr}`);
    },
    update: (id: string, body: { name?: string; description?: string; icon?: string }) =>
      request<Vault>(`/vaults/${id}`, { method: "PATCH", body: JSON.stringify(body) }),
    delete: (id: string) => request<void>(`/vaults/${id}`, { method: "DELETE" }),
    importUrl: (
      vaultId: string,
      body: { url: string; filename?: string; description?: string; folder?: string; tags?: string[] },
    ) =>
      request<VaultFile>(`/vaults/${vaultId}/import-url`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    importUrls: (
      vaultId: string,
      body: { urls: string[]; folder?: string; tags?: string[] },
    ) =>
      request<VaultFile[]>(`/vaults/${vaultId}/import-urls`, {
        method: "POST",
        body: JSON.stringify(body),
      }),
    upload: (
      vaultId: string,
      file: File,
      description?: string,
      folder?: string,
      tags?: string[],
    ) => {
      const form = new FormData();
      form.append("file", file);
      const q = new URLSearchParams();
      if (description) q.set("description", description);
      if (folder) q.set("folder", folder);
      if (tags && tags.length > 0) q.set("tags", tags.join(","));
      const queryStr = q.toString() ? `?${q.toString()}` : "";
      return request<VaultFile>(`/vaults/${vaultId}/upload${queryStr}`, {
        method: "POST",
        body: form,
      });
    },
    getFile: (vaultId: string, fileId: string) =>
      request<VaultFile>(`/vaults/${vaultId}/files/${fileId}`),
    inspect: (vaultId: string, fileId: string) =>
      request<VaultFileInspect>(`/vaults/${vaultId}/files/${fileId}/inspect`),
    updateFile: (
      vaultId: string,
      fileId: string,
      body: {
        filename?: string;
        description?: string;
        folder?: string | null;
        tags?: string[];
        vault_id?: string;
      },
    ) =>
      request<VaultFile>(`/vaults/${vaultId}/files/${fileId}`, {
        method: "PATCH",
        body: JSON.stringify(body),
      }),
    deleteFile: (vaultId: string, fileId: string) =>
      request<void>(`/vaults/${vaultId}/files/${fileId}`, { method: "DELETE" }),
    bulkDelete: (vaultId: string, fileIds: string[]) =>
      request<void>(`/vaults/${vaultId}/files/bulk-delete`, {
        method: "POST",
        body: JSON.stringify({ file_ids: fileIds }),
      }),
    bulkMove: (vaultId: string, fileIds: string[], targetVaultId: string) =>
      request<{ moved_count: number }>(`/vaults/${vaultId}/files/bulk-move`, {
        method: "POST",
        body: JSON.stringify({ file_ids: fileIds, target_vault_id: targetVaultId }),
      }),
    bulkDownloadZip: async (vaultId: string, fileIds: string[]) => {
      const resp = await fetch(`${BASE}/vaults/${vaultId}/files/bulk-download-zip`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ file_ids: fileIds }),
      });
      if (!resp.ok) throw new Error("تعذر تحميل الملفات المحددة");
      const blob = await resp.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = "selected_files.zip";
      document.body.appendChild(a);
      a.click();
      a.remove();
      window.URL.revokeObjectURL(url);
    },
    exportZipUrl: (vaultId: string) => `${BASE}/vaults/${vaultId}/export-zip`,
    downloadUrl: (vaultId: string, fileId: string) => `${BASE}/vaults/${vaultId}/files/${fileId}/download`,
    viewUrl: (vaultId: string, fileId: string) => `${BASE}/vaults/${vaultId}/files/${fileId}/view`,
  },

  admin: {
    getUsers: () => request<AdminUser[]>("/auth/admin/users"),
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

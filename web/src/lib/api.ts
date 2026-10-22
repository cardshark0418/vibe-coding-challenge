import type { Member, Segment, StatsResponse, Task, UploadedVideo, User } from './types';

const TOKEN_KEY = 'framewise.token';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}
export function setToken(token: string) {
  localStorage.setItem(TOKEN_KEY, token);
}
export function clearToken() {
  localStorage.removeItem(TOKEN_KEY);
}

export class ApiError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

async function request<T>(path: string, options: RequestInit = {}): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...((options.headers as Record<string, string>) || {}),
  };
  if (token) headers.Authorization = `Bearer ${token}`;

  const response = await fetch(`/api${path}`, { ...options, headers });
  const text = await response.text();
  const data = text ? JSON.parse(text) : null;

  if (!response.ok) {
    throw new ApiError(response.status, data?.error || `请求失败（${response.status}）`);
  }
  return data as T;
}

export const api = {
  login: (username: string, password: string) =>
    request<{ token: string; user: User }>('/auth/login', {
      method: 'POST',
      body: JSON.stringify({ username, password }),
    }),

  me: () => request<{ user: User }>('/auth/me'),

  tasks: () => request<{ tasks: Task[] }>('/tasks'),
  task: (id: number) => request<{ task: Task }>(`/tasks/${id}`),
  claim: (id: number) => request<{ task: Task }>(`/tasks/${id}/claim`, { method: 'POST' }),
  saveSegments: (id: number, segments: Segment[]) =>
    request<{ task: Task }>(`/tasks/${id}/segments`, {
      method: 'PUT',
      body: JSON.stringify({ segments }),
    }),
  submit: (id: number) => request<{ task: Task }>(`/tasks/${id}/submit`, { method: 'POST' }),
  reportVideoMeta: (id: number, durationMs: number) =>
    request<{ task: Task }>(`/tasks/${id}/video-meta`, {
      method: 'POST',
      body: JSON.stringify({ durationMs }),
    }),

  adminTasks: () => request<{ tasks: Task[] }>('/admin/tasks'),
  uploadVideo: async (file: File, durationMs: number) => {
    const form = new FormData();
    form.append('file', file);
    if (durationMs > 0) form.append('durationMs', String(Math.round(durationMs)));

    const token = getToken();
    const headers: Record<string, string> = {};
    if (token) headers.Authorization = `Bearer ${token}`;
    const response = await fetch('/api/admin/videos', { method: 'POST', body: form, headers });
    const text = await response.text();
    const data = text ? JSON.parse(text) : null;
    if (!response.ok) {
      throw new ApiError(response.status, data?.error || `上传失败（${response.status}）`);
    }
    return data as { video: UploadedVideo };
  },
  createTask: (payload: {
    title: string;
    description?: string;
    videoUrl?: string;
    videoId?: number;
    durationMs?: number;
    assigneeId?: number | null;
  }) => request<{ task: Task }>('/admin/tasks', { method: 'POST', body: JSON.stringify(payload) }),
  deleteTask: (id: number) => request<{ ok: true }>(`/admin/tasks/${id}`, { method: 'DELETE' }),
  stats: (from?: string, to?: string, annotatorId?: number | null) => {
    const query = new URLSearchParams();
    if (from) query.set('from', from);
    if (to) query.set('to', to);
    if (annotatorId) query.set('annotatorId', String(annotatorId));
    return request<StatsResponse>(`/admin/stats?${query.toString()}`);
  },
  members: () => request<{ members: Member[] }>('/admin/members'),
  createMember: (payload: {
    username: string;
    password: string;
    name: string;
    role: 'admin' | 'annotator';
  }) => request<{ member: Member }>('/admin/members', { method: 'POST', body: JSON.stringify(payload) }),
};

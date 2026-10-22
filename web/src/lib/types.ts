export type Role = 'admin' | 'annotator';
export type TaskStatus = 'open' | 'in_progress' | 'submitted';

export interface Tenant {
  id: number;
  name: string;
  slug: string;
}

export interface User {
  id: number;
  username: string;
  name: string;
  role: Role;
  tenant: Tenant;
}

export interface Segment {
  id?: number;
  startMs: number;
  endMs: number;
}

export interface Task {
  id: number;
  title: string;
  description: string;
  videoUrl: string;
  durationMs: number;
  status: TaskStatus;
  assignee: { id: number; name: string } | null;
  createdAt: string;
  submittedAt: string | null;
  segmentCount: number;
  totalMs: number;
  segments?: Segment[];
}

export interface DailyStat {
  date: string;
  totalMs: number;
  taskCount: number;
  annotatorCount: number;
  tasks: { id: number; title: string; assignee: string; totalMs: number; submittedAt: string }[];
}

export interface StatsResponse {
  range: { from: string; to: string };
  annotator: { id: number; name: string } | null;
  days: DailyStat[];
  totals: { totalMs: number; taskCount: number; annotatorCount: number };
}

export interface UploadedVideo {
  id: number;
  url: string;
  originalName: string;
  sizeBytes: number;
  durationMs: number;
}

export interface Member {
  id: number;
  username: string;
  name: string;
  role: Role;
  createdAt?: string;
  submittedTasks: number;
  submittedMs: number;
}

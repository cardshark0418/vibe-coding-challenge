import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Database from 'better-sqlite3';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.resolve(__dirname, '../data');
fs.mkdirSync(dataDir, { recursive: true });

export const dbFile = path.join(dataDir, 'annotation.db');
export const uploadsDir = path.join(dataDir, 'uploads');
fs.mkdirSync(uploadsDir, { recursive: true });
export const db = new Database(dbFile);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

db.exec(`
  CREATE TABLE IF NOT EXISTS tenants (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    name       TEXT NOT NULL UNIQUE,
    slug       TEXT NOT NULL UNIQUE,
    created_at TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS users (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     INTEGER NOT NULL REFERENCES tenants(id),
    username      TEXT NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    name          TEXT NOT NULL,
    role          TEXT NOT NULL CHECK (role IN ('admin', 'annotator')),
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS videos (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id     INTEGER NOT NULL REFERENCES tenants(id),
    storage_key   TEXT NOT NULL UNIQUE,
    original_name TEXT NOT NULL,
    mime          TEXT NOT NULL,
    size_bytes    INTEGER NOT NULL,
    duration_ms   INTEGER NOT NULL DEFAULT 0,
    created_by    INTEGER NOT NULL REFERENCES users(id),
    created_at    TEXT NOT NULL DEFAULT (datetime('now', 'localtime'))
  );

  CREATE TABLE IF NOT EXISTS tasks (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    tenant_id    INTEGER NOT NULL REFERENCES tenants(id),
    title        TEXT NOT NULL,
    description  TEXT NOT NULL DEFAULT '',
    video_url    TEXT NOT NULL,
    duration_ms  INTEGER NOT NULL DEFAULT 0,
    status       TEXT NOT NULL DEFAULT 'open' CHECK (status IN ('open', 'in_progress', 'submitted')),
    assignee_id  INTEGER REFERENCES users(id),
    created_by   INTEGER NOT NULL REFERENCES users(id),
    created_at   TEXT NOT NULL DEFAULT (datetime('now', 'localtime')),
    submitted_at TEXT
  );

  CREATE TABLE IF NOT EXISTS segments (
    id       INTEGER PRIMARY KEY AUTOINCREMENT,
    task_id  INTEGER NOT NULL REFERENCES tasks(id) ON DELETE CASCADE,
    start_ms INTEGER NOT NULL,
    end_ms   INTEGER NOT NULL,
    CHECK (end_ms > start_ms),
    CHECK (start_ms >= 0)
  );

  CREATE INDEX IF NOT EXISTS idx_tasks_tenant ON tasks(tenant_id, status);
  CREATE INDEX IF NOT EXISTS idx_tasks_assignee ON tasks(assignee_id);
  CREATE INDEX IF NOT EXISTS idx_segments_task ON segments(task_id);
  CREATE INDEX IF NOT EXISTS idx_videos_tenant ON videos(tenant_id);
`);

// 旧库补列：任务关联的上传视频
const taskColumns = db.pragma('table_info(tasks)').map((column) => column.name);
if (!taskColumns.includes('video_id')) {
  db.exec('ALTER TABLE tasks ADD COLUMN video_id INTEGER REFERENCES videos(id)');
}

export function toUserPayload(row) {
  return {
    id: row.id,
    username: row.username,
    name: row.name,
    role: row.role,
    tenant: { id: row.tenant_id, name: row.tenant_name, slug: row.tenant_slug },
  };
}

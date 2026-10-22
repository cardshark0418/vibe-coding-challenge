import { db } from './db.js';

const MIN_SEGMENT_MS = 100;

function badRequest(message) {
  const error = new Error(message);
  error.status = 400;
  return error;
}

/** 校验并规范化时间段：不重叠、按开始时间排序、落在视频时长内 */
export function parseSegments(input, durationMs) {
  if (!Array.isArray(input)) throw badRequest('时间段格式不正确');

  const segments = input.map((item) => {
    const startMs = Math.round(Number(item?.startMs));
    const endMs = Math.round(Number(item?.endMs));
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) {
      throw badRequest('时间段格式不正确');
    }
    if (startMs < 0) throw badRequest('时间段起点不能小于 0');
    if (endMs - startMs < MIN_SEGMENT_MS) throw badRequest('单个时间段至少 0.1 秒');
    if (durationMs > 0 && endMs > durationMs + 50) throw badRequest('时间段超出视频时长');
    return { startMs, endMs };
  });

  segments.sort((a, b) => a.startMs - b.startMs);
  for (let i = 1; i < segments.length; i += 1) {
    if (segments[i].startMs < segments[i - 1].endMs) {
      throw badRequest('同一任务内的时间段不能重叠');
    }
  }
  return segments;
}

export function loadSegments(taskId) {
  return db
    .prepare(
      'SELECT id, start_ms AS startMs, end_ms AS endMs FROM segments WHERE task_id = ? ORDER BY start_ms'
    )
    .all(taskId);
}

export function serializeTask(row, { segments } = {}) {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    videoUrl: row.video_url,
    durationMs: row.duration_ms,
    status: row.status,
    assignee: row.assignee_id ? { id: row.assignee_id, name: row.assignee_name } : null,
    createdAt: row.created_at,
    submittedAt: row.submitted_at,
    segmentCount: row.segment_count ?? segments?.length ?? 0,
    totalMs: row.total_ms ?? segments?.reduce((sum, s) => sum + (s.endMs - s.startMs), 0) ?? 0,
    ...(segments ? { segments } : {}),
  };
}

export function findTaskRow(taskId, tenantId) {
  return db
    .prepare(
      `SELECT t.*, u.name AS assignee_name,
              (SELECT COUNT(*) FROM segments s WHERE s.task_id = t.id) AS segment_count,
              (SELECT COALESCE(SUM(s.end_ms - s.start_ms), 0) FROM segments s WHERE s.task_id = t.id) AS total_ms
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.id = ? AND t.tenant_id = ?`
    )
    .get(taskId, tenantId);
}

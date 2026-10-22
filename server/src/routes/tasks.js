import { Router } from 'express';
import { db } from '../db.js';
import { authenticate } from '../auth.js';
import { findTaskRow, loadSegments, parseSegments, serializeTask } from '../helpers.js';

export const taskRouter = Router();

taskRouter.use(authenticate);

function canAnnotatorSee(row, userId) {
  return row.status === 'open' || row.assignee_id === userId;
}

taskRouter.get('/', (req, res) => {
  const isAdmin = req.user.role === 'admin';
  // 标注员只能看到待领取任务和自己名下的任务，别人的任务不出现在大厅里
  const rows = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name,
              (SELECT COUNT(*) FROM segments s WHERE s.task_id = t.id) AS segment_count,
              (SELECT COALESCE(SUM(s.end_ms - s.start_ms), 0) FROM segments s WHERE s.task_id = t.id) AS total_ms
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.tenant_id = ?${isAdmin ? '' : " AND (t.status = 'open' OR t.assignee_id = ?)"}
       ORDER BY CASE t.status WHEN 'open' THEN 0 WHEN 'in_progress' THEN 1 ELSE 2 END,
                t.created_at DESC, t.id DESC`
    )
    .all(...(isAdmin ? [req.user.tenant.id] : [req.user.tenant.id, req.user.id]));

  res.json({ tasks: rows.map((row) => serializeTask(row)) });
});

taskRouter.get('/:id', (req, res) => {
  const row = findTaskRow(Number(req.params.id), req.user.tenant.id);
  if (!row) return res.status(404).json({ error: '任务不存在' });
  if (req.user.role !== 'admin' && !canAnnotatorSee(row, req.user.id)) {
    return res.status(404).json({ error: '任务不存在' });
  }
  res.json({ task: serializeTask(row, { segments: loadSegments(row.id) }) });
});

taskRouter.post('/:id/claim', (req, res) => {
  if (req.user.role !== 'annotator') return res.status(403).json({ error: '管理员不能领取任务' });

  const taskId = Number(req.params.id);
  const row = findTaskRow(taskId, req.user.tenant.id);
  if (!row) return res.status(404).json({ error: '任务不存在' });
  if (row.status === 'submitted') return res.status(409).json({ error: '任务已提交，无法领取' });
  if (row.assignee_id && row.assignee_id !== req.user.id) {
    return res.status(409).json({ error: `任务已被 ${row.assignee_name} 领取` });
  }

  db.prepare(
    `UPDATE tasks SET assignee_id = ?, status = 'in_progress'
     WHERE id = ? AND tenant_id = ? AND status != 'submitted'`
  ).run(req.user.id, taskId, req.user.tenant.id);

  const updated = findTaskRow(taskId, req.user.tenant.id);
  res.json({ task: serializeTask(updated, { segments: loadSegments(taskId) }) });
});

taskRouter.put('/:id/segments', (req, res) => {
  const taskId = Number(req.params.id);
  const row = findTaskRow(taskId, req.user.tenant.id);
  if (!row) return res.status(404).json({ error: '任务不存在' });
  if (row.status === 'submitted') return res.status(409).json({ error: '任务已提交，不能再修改' });
  if (row.assignee_id !== req.user.id) return res.status(403).json({ error: '请先领取任务' });

  const segments = parseSegments(req.body?.segments, row.duration_ms);

  const replace = db.transaction(() => {
    db.prepare('DELETE FROM segments WHERE task_id = ?').run(taskId);
    const insert = db.prepare('INSERT INTO segments (task_id, start_ms, end_ms) VALUES (?, ?, ?)');
    for (const seg of segments) insert.run(taskId, seg.startMs, seg.endMs);
    db.prepare(
      `UPDATE tasks SET status = 'in_progress'
       WHERE id = ? AND status = 'open'`
    ).run(taskId);
  });
  replace();

  const updated = findTaskRow(taskId, req.user.tenant.id);
  res.json({ task: serializeTask(updated, { segments: loadSegments(taskId) }) });
});

taskRouter.post('/:id/submit', (req, res) => {
  const taskId = Number(req.params.id);
  const row = findTaskRow(taskId, req.user.tenant.id);
  if (!row) return res.status(404).json({ error: '任务不存在' });
  if (row.status === 'submitted') return res.status(409).json({ error: '任务已提交' });
  if (row.assignee_id !== req.user.id) return res.status(403).json({ error: '只能提交自己领取的任务' });

  const segmentCount = db
    .prepare('SELECT COUNT(*) AS n FROM segments WHERE task_id = ?')
    .get(taskId).n;
  if (segmentCount === 0) return res.status(400).json({ error: '至少标注一个时间段后才能提交' });

  db.prepare(
    `UPDATE tasks
     SET status = 'submitted', submitted_at = datetime('now', 'localtime')
     WHERE id = ? AND status != 'submitted'`
  ).run(taskId);

  const updated = findTaskRow(taskId, req.user.tenant.id);
  res.json({ task: serializeTask(updated, { segments: loadSegments(taskId) }) });
});

taskRouter.post('/:id/video-meta', (req, res) => {
  const taskId = Number(req.params.id);
  const row = findTaskRow(taskId, req.user.tenant.id);
  if (!row) return res.status(404).json({ error: '任务不存在' });

  const isOwner = row.assignee_id === req.user.id;
  const isAdmin = req.user.role === 'admin';
  if (!isOwner && !isAdmin) return res.status(403).json({ error: '没有权限更新视频信息' });

  const durationMs = Math.round(Number(req.body?.durationMs));
  if (!Number.isFinite(durationMs) || durationMs < 500 || durationMs > 6 * 60 * 60 * 1000) {
    return res.status(400).json({ error: '视频时长不合法' });
  }

  // 浏览器实际解码出的时长优先于发布任务时填写的估算值
  db.prepare(
    `UPDATE tasks SET duration_ms = ?
     WHERE id = ? AND (duration_ms = 0 OR ABS(duration_ms - ?) > 1000)`
  ).run(durationMs, taskId, durationMs);

  const updated = findTaskRow(taskId, req.user.tenant.id);
  res.json({ task: serializeTask(updated) });
});

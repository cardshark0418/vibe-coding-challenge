import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import bcrypt from 'bcryptjs';
import multer from 'multer';
import { db, uploadsDir } from '../db.js';
import { authenticate, requireRole } from '../auth.js';
import { serializeTask } from '../helpers.js';

export const adminRouter = Router();

adminRouter.use(authenticate, requireRole('admin'));

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const ALLOWED_VIDEO_EXT = new Set(['.mp4', '.webm', '.mov', '.m4v']);

const videoUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      const dir = path.join(uploadsDir, req.user.tenant.slug);
      fs.mkdirSync(dir, { recursive: true });
      cb(null, dir);
    },
    filename(req, file, cb) {
      cb(null, `${crypto.randomUUID()}${path.extname(file.originalname).toLowerCase()}`);
    },
  }),
  limits: { fileSize: MAX_VIDEO_BYTES, files: 1 },
  fileFilter(req, file, cb) {
    const ext = path.extname(file.originalname).toLowerCase();
    if (!ALLOWED_VIDEO_EXT.has(ext)) {
      return cb(Object.assign(new Error('仅支持 mp4 / webm / mov / m4v 格式的视频'), { status: 400 }));
    }
    if (file.mimetype && !file.mimetype.startsWith('video/') && file.mimetype !== 'application/octet-stream') {
      return cb(Object.assign(new Error('上传的文件不是视频'), { status: 400 }));
    }
    cb(null, true);
  },
});

function localDateString(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

adminRouter.get('/tasks', (req, res) => {
  const rows = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name,
              (SELECT COUNT(*) FROM segments s WHERE s.task_id = t.id) AS segment_count,
              (SELECT COALESCE(SUM(s.end_ms - s.start_ms), 0) FROM segments s WHERE s.task_id = t.id) AS total_ms
       FROM tasks t
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.tenant_id = ?
       ORDER BY t.created_at DESC, t.id DESC`
    )
    .all(req.user.tenant.id);

  res.json({ tasks: rows.map((row) => serializeTask(row)) });
});

adminRouter.post('/videos', (req, res, next) => {
  videoUpload.single('file')(req, res, (err) => {
    if (!err) return next();
    if (err.code === 'LIMIT_FILE_SIZE') {
      return res.status(413).json({ error: '视频不能超过 200MB' });
    }
    return res.status(err.status || 400).json({ error: err.message || '视频上传失败' });
  });
}, (req, res) => {
  if (!req.file) return res.status(400).json({ error: '请选择视频文件' });

  const durationMs = Math.round(Number(req.body?.durationMs || 0));
  if (!Number.isFinite(durationMs) || durationMs < 0 || (durationMs > 0 && durationMs < 500)) {
    fs.rmSync(req.file.path, { force: true });
    return res.status(400).json({ error: '视频时长不合法' });
  }

  const storageKey = `${req.user.tenant.slug}/${req.file.filename}`;
  try {
    const info = db
      .prepare(
        `INSERT INTO videos (tenant_id, storage_key, original_name, mime, size_bytes, duration_ms, created_by)
         VALUES (?, ?, ?, ?, ?, ?, ?)`
      )
      .run(
        req.user.tenant.id,
        storageKey,
        req.file.originalname,
        req.file.mimetype || 'video/mp4',
        req.file.size,
        durationMs,
        req.user.id
      );

    res.status(201).json({
      video: {
        id: Number(info.lastInsertRowid),
        url: `/media/${storageKey}`,
        originalName: req.file.originalname,
        sizeBytes: req.file.size,
        durationMs,
      },
    });
  } catch (err) {
    fs.rmSync(req.file.path, { force: true });
    throw err;
  }
});

adminRouter.post('/tasks', (req, res) => {
  const title = String(req.body?.title || '').trim();
  const description = String(req.body?.description || '').trim();
  let videoUrl = String(req.body?.videoUrl || '').trim();
  let durationMs = Math.round(Number(req.body?.durationMs || 0));
  const assigneeId = req.body?.assigneeId ? Number(req.body.assigneeId) : null;

  let videoId = null;
  if (req.body?.videoId) {
    const id = Number(req.body.videoId);
    const video = Number.isInteger(id)
      ? db.prepare('SELECT * FROM videos WHERE id = ? AND tenant_id = ?').get(id, req.user.tenant.id)
      : null;
    if (!video) return res.status(400).json({ error: '上传的视频不存在' });
    videoId = video.id;
    videoUrl = `/media/${video.storage_key}`;
    if (!durationMs) durationMs = video.duration_ms;
  }

  if (!title) return res.status(400).json({ error: '请填写任务标题' });
  if (!videoUrl) return res.status(400).json({ error: '请上传视频或填写视频地址' });
  if (!/^(https?:\/\/|\/)/.test(videoUrl)) {
    return res.status(400).json({ error: '视频地址需为 http(s) 链接或以 / 开头的站内路径' });
  }
  if (!Number.isFinite(durationMs) || durationMs < 0) {
    return res.status(400).json({ error: '视频时长不合法' });
  }

  let assignee = null;
  if (assigneeId) {
    assignee = db
      .prepare(
        `SELECT id, name, role FROM users
         WHERE id = ? AND tenant_id = ? AND role = 'annotator'`
      )
      .get(assigneeId, req.user.tenant.id);
    if (!assignee) return res.status(400).json({ error: '指派对象不存在或不是标注员' });
  }

  const info = db
    .prepare(
      `INSERT INTO tasks (tenant_id, title, description, video_url, duration_ms, status, assignee_id, created_by, video_id)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`
    )
    .run(
      req.user.tenant.id,
      title,
      description,
      videoUrl,
      durationMs,
      assignee ? 'in_progress' : 'open',
      assignee ? assignee.id : null,
      req.user.id,
      videoId
    );

  const row = db
    .prepare(
      `SELECT t.*, u.name AS assignee_name,
              (SELECT COUNT(*) FROM segments s WHERE s.task_id = t.id) AS segment_count,
              (SELECT COALESCE(SUM(s.end_ms - s.start_ms), 0) FROM segments s WHERE s.task_id = t.id) AS total_ms
       FROM tasks t LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.id = ?`
    )
    .get(info.lastInsertRowid);

  res.status(201).json({ task: serializeTask(row) });
});

adminRouter.delete('/tasks/:id', (req, res) => {
  const row = db
    .prepare('SELECT id, status, video_id FROM tasks WHERE id = ? AND tenant_id = ?')
    .get(Number(req.params.id), req.user.tenant.id);
  if (!row) return res.status(404).json({ error: '任务不存在' });
  if (row.status === 'submitted') {
    return res.status(409).json({ error: '已提交的任务需要保留，不能删除' });
  }
  db.prepare('DELETE FROM tasks WHERE id = ?').run(row.id);

  if (row.video_id) {
    const video = db
      .prepare('SELECT id, storage_key FROM videos WHERE id = ? AND tenant_id = ?')
      .get(row.video_id, req.user.tenant.id);
    if (video) {
      fs.rmSync(path.join(uploadsDir, video.storage_key), { force: true });
      db.prepare('DELETE FROM videos WHERE id = ?').run(video.id);
    }
  }

  res.json({ ok: true });
});

adminRouter.get('/stats', (req, res) => {
  const today = new Date();
  const defaultFrom = new Date(today);
  defaultFrom.setDate(defaultFrom.getDate() - 13);

  const from = DATE_RE.test(String(req.query.from || '')) ? String(req.query.from) : localDateString(defaultFrom);
  const to = DATE_RE.test(String(req.query.to || '')) ? String(req.query.to) : localDateString(today);
  if (from > to) return res.status(400).json({ error: '开始日期不能晚于结束日期' });

  // 可选：按标注员筛选，只统计该标注员名下已提交的任务
  let annotator = null;
  if (req.query.annotatorId) {
    const annotatorId = Number(req.query.annotatorId);
    if (!Number.isInteger(annotatorId) || annotatorId <= 0) {
      return res.status(400).json({ error: '标注员参数不合法' });
    }
    annotator = db
      .prepare(
        `SELECT id, name FROM users
         WHERE id = ? AND tenant_id = ? AND role = 'annotator'`
      )
      .get(annotatorId, req.user.tenant.id);
    if (!annotator) return res.status(404).json({ error: '标注员不存在' });
  }

  const rows = db
    .prepare(
      `SELECT t.id, t.title, t.submitted_at, date(t.submitted_at) AS day,
              u.name AS assignee_name,
              COALESCE(SUM(s.end_ms - s.start_ms), 0) AS total_ms
       FROM tasks t
       LEFT JOIN segments s ON s.task_id = t.id
       LEFT JOIN users u ON u.id = t.assignee_id
       WHERE t.tenant_id = ? AND t.status = 'submitted'
         AND date(t.submitted_at) BETWEEN ? AND ?
         ${annotator ? 'AND t.assignee_id = ?' : ''}
       GROUP BY t.id
       ORDER BY t.submitted_at DESC, t.id DESC`
    )
    .all(...(annotator ? [req.user.tenant.id, from, to, annotator.id] : [req.user.tenant.id, from, to]));

  const dayMap = new Map();
  for (let d = new Date(`${from}T00:00:00`); localDateString(d) <= to; d.setDate(d.getDate() + 1)) {
    const key = localDateString(d);
    dayMap.set(key, { date: key, totalMs: 0, tasks: [], annotators: new Set() });
  }

  for (const row of rows) {
    const day = dayMap.get(row.day);
    if (!day) continue;
    day.totalMs += row.total_ms;
    day.tasks.push({
      id: row.id,
      title: row.title,
      assignee: row.assignee_name || '未指派',
      totalMs: row.total_ms,
      submittedAt: row.submitted_at,
    });
    if (row.assignee_name) day.annotators.add(row.assignee_name);
  }

  const days = [...dayMap.values()]
    .map((day) => ({
      date: day.date,
      totalMs: day.totalMs,
      taskCount: day.tasks.length,
      annotatorCount: day.annotators.size,
      tasks: day.tasks,
    }))
    .reverse();

  const totalMs = days.reduce((sum, day) => sum + day.totalMs, 0);
  const taskCount = days.reduce((sum, day) => sum + day.taskCount, 0);
  const annotators = new Set(days.flatMap((day) => day.tasks.map((t) => t.assignee)));

  res.json({
    range: { from, to },
    annotator: annotator ? { id: annotator.id, name: annotator.name } : null,
    days,
    totals: { totalMs, taskCount, annotatorCount: annotators.size },
  });
});

adminRouter.get('/members', (req, res) => {
  const members = db
    .prepare(
      `SELECT u.id, u.username, u.name, u.role, u.created_at,
              (SELECT COUNT(*) FROM tasks t WHERE t.assignee_id = u.id AND t.status = 'submitted') AS submitted_tasks,
              (SELECT COALESCE(SUM(s.end_ms - s.start_ms), 0)
                 FROM tasks t JOIN segments s ON s.task_id = t.id
                WHERE t.assignee_id = u.id AND t.status = 'submitted') AS submitted_ms
       FROM users u
       WHERE u.tenant_id = ?
       ORDER BY u.role DESC, u.id`
    )
    .all(req.user.tenant.id);

  res.json({
    members: members.map((m) => ({
      id: m.id,
      username: m.username,
      name: m.name,
      role: m.role,
      createdAt: m.created_at,
      submittedTasks: m.submitted_tasks,
      submittedMs: m.submitted_ms,
    })),
  });
});

adminRouter.post('/members', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  const name = String(req.body?.name || '').trim();
  const role = req.body?.role === 'admin' ? 'admin' : 'annotator';

  if (!/^[a-zA-Z0-9_.-]{3,32}$/.test(username)) {
    return res.status(400).json({ error: '账号需为 3-32 位字母、数字或 _ . -' });
  }
  if (password.length < 6) return res.status(400).json({ error: '密码至少 6 位' });
  if (!name) return res.status(400).json({ error: '请填写姓名' });

  const exists = db.prepare('SELECT id FROM users WHERE username = ?').get(username);
  if (exists) return res.status(409).json({ error: '账号已存在' });

  const info = db
    .prepare(
      `INSERT INTO users (tenant_id, username, password_hash, name, role)
       VALUES (?, ?, ?, ?, ?)`
    )
    .run(req.user.tenant.id, username, bcrypt.hashSync(password, 10), name, role);

  res.status(201).json({
    member: { id: info.lastInsertRowid, username, name, role, submittedTasks: 0, submittedMs: 0 },
  });
});

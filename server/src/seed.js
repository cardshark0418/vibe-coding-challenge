import bcrypt from 'bcryptjs';
import { db } from './db.js';

const hash = (password) => bcrypt.hashSync(password, 10);

export function seedIfEmpty() {
  const count = db.prepare('SELECT COUNT(*) AS n FROM users').get().n;
  if (count > 0) return false;

  const run = db.transaction(() => {
    const insertTenant = db.prepare('INSERT INTO tenants (name, slug) VALUES (?, ?)');
    const insertUser = db.prepare(
      `INSERT INTO users (tenant_id, username, password_hash, name, role)
       VALUES (?, ?, ?, ?, ?)`
    );
    const insertTask = db.prepare(
      `INSERT INTO tasks (tenant_id, title, description, video_url, duration_ms, status, assignee_id, created_by, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now', 'localtime', ?))`
    );
    const insertSegment = db.prepare(
      'INSERT INTO segments (task_id, start_ms, end_ms) VALUES (?, ?, ?)'
    );
    const markSubmitted = db.prepare(
      `UPDATE tasks SET submitted_at = datetime('now', 'localtime', ?) WHERE id = ?`
    );

    const stellar = Number(insertTenant.run('星辰数据', 'stellar').lastInsertRowid);
    const bluewave = Number(insertTenant.run('蓝海智能', 'bluewave').lastInsertRowid);

    const admin = Number(insertUser.run(stellar, 'admin', hash('admin123'), '陈默', 'admin').lastInsertRowid);
    const lisi = Number(insertUser.run(stellar, 'lisi', hash('123456'), '李思', 'annotator').lastInsertRowid);
    const wangwu = Number(insertUser.run(stellar, 'wangwu', hash('123456'), '王五', 'annotator').lastInsertRowid);
    const admin2 = Number(insertUser.run(bluewave, 'admin2', hash('admin123'), '周岚', 'admin').lastInsertRowid);
    insertUser.run(bluewave, 'zhaoliu', hash('123456'), '赵柳', 'annotator');

    const video = '/videos/pusht-demo.mp4';
    const videoDurationMs = 40_000;

    const createTask = (tenantId, title, desc, status, assigneeId, createdBy, createdAt, segments = []) => {
      const taskId = Number(
        insertTask.run(tenantId, title, desc, video, videoDurationMs, status, assigneeId, createdBy, createdAt)
          .lastInsertRowid
      );
      for (const [startMs, endMs] of segments) insertSegment.run(taskId, startMs, endMs);
      return taskId;
    };

    // 待领取
    createTask(
      stellar,
      '推方块 · 第 1 组片段',
      '标出机械臂接触方块到推到目标区域的完整片段，尽量包含一次完整的推动动作。',
      'open',
      null,
      admin,
      '-2 hours'
    );

    // 已领取、标注中
    createTask(
      stellar,
      '推方块 · 第 2 组片段',
      '重点标出夹爪靠近与离开方块的时间区间。',
      'in_progress',
      lisi,
      admin,
      '-5 hours',
      [
        [1200, 3800],
        [5200, 7400],
      ]
    );

    // 已提交任务：统计页演示数据
    const yesterday = createTask(
      stellar,
      '推方块 · 第 3 组片段',
      '标出所有有效推动片段。',
      'submitted',
      lisi,
      admin,
      '-2 days',
      [
        [800, 4200],
        [6100, 9300],
      ]
    );
    markSubmitted.run('-1 day', yesterday);

    const today = createTask(
      stellar,
      '推方块 · 第 4 组片段',
      '标出所有有效推动片段。',
      'submitted',
      wangwu,
      admin,
      '-4 days',
      [
        [1500, 5000],
        [7000, 8600],
        [10200, 11800],
      ]
    );
    markSubmitted.run('-10 minutes', today);

    const threeDaysAgo = createTask(
      stellar,
      '推方块 · 第 5 组片段',
      '标出所有有效推动片段。',
      'submitted',
      lisi,
      admin,
      '-6 days',
      [[900, 5600]]
    );
    markSubmitted.run('-3 days', threeDaysAgo);

    // 另一个租户的任务，用于验证数据隔离
    createTask(
      bluewave,
      '机械臂抓取 · 基线标注',
      '蓝海智能内部任务，其他租户不可见。',
      'open',
      null,
      admin2,
      '-1 hours'
    );
  });

  run();
  return true;
}

if (process.argv[1] && process.argv[1].endsWith('seed.js')) {
  const seeded = seedIfEmpty();
  console.log(seeded ? '已写入演示数据' : '数据库已有数据，跳过 seed');
}

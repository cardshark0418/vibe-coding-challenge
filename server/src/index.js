import path from 'node:path';
import fs from 'node:fs';
import { fileURLToPath } from 'node:url';
import express from 'express';
import cors from 'cors';
import { uploadsDir } from './db.js';
import { seedIfEmpty } from './seed.js';
import { authRouter } from './routes/auth.js';
import { taskRouter } from './routes/tasks.js';
import { adminRouter } from './routes/admin.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const app = express();

app.use(cors());
app.use(express.json({ limit: '1mb' }));

app.use('/videos', express.static(path.resolve(__dirname, '../public/videos')));
// 上传的视频：express.static 原生支持 Range 请求，播放器可以拖动进度
app.use('/media', express.static(uploadsDir, { maxAge: '7d' }));
app.use('/media', (req, res) => res.status(404).json({ error: '视频不存在' }));

app.get('/api/health', (req, res) => res.json({ ok: true }));
app.use('/api/auth', authRouter);
app.use('/api/tasks', taskRouter);
app.use('/api/admin', adminRouter);

app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }));

// 生产模式下直接托管前端构建产物
const webDist = path.resolve(__dirname, '../../web/dist');
if (fs.existsSync(webDist)) {
  app.use(express.static(webDist));
  app.get('*', (req, res) => res.sendFile(path.join(webDist, 'index.html')));
}

app.use((err, req, res, next) => {
  console.error(err);
  const status = err.status || 500;
  res.status(status).json({ error: status === 500 ? '服务器开小差了，请稍后重试' : err.message });
});

seedIfEmpty();

app.listen(PORT, () => {
  console.log(`API 服务已启动: http://localhost:${PORT}`);
});

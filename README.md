# Framewise · 视频片段标注平台

让多个团队的标注员在视频上标出有效时间段，管理员按天统计真实有效工作时长。

> 原始题目见 [docs/CHALLENGE.md](docs/CHALLENGE.md)。实现说明与取舍见 [report.md](report.md)。
> 仓库地址：https://github.com/cardshark0418/vibe-coding-challenge

## 功能

**标注员**

- 登录后进入任务大厅，按「待领取 / 标注中 / 已提交」筛选、搜索任务
- 领取任务（一人独占），在视频下方时间轴上拖拽创建片段、拖动调整起止边界、删除片段
- 片段自动保存；同一任务内时间段不会重叠（前端限制 + 后端强校验）
- 提交后结果锁定，有效时长计入提交当天
- 快捷键：`Space` 播放/暂停，`N` 在当前位置新增 2 秒片段，`Del` 删除选中，`←/→` 快退/快进 1 秒（`Shift` 为 5 秒）

**管理员**

- 发布任务：指定视频地址、时长（可留空，播放时自动读取）、可选指派标注员
- 任务管理：状态分布、领取人、片段数、有效时长，可删除未提交任务
- 工作量统计：区间总时长、每日趋势柱状图、按天明细（可展开看当天每个任务）
- 团队成员：新增成员、查看每人已提交任务与累计有效时长
- 点击任务标题可进入只读详情，查看已提交任务的时间段列表

**租户隔离**

每个用户属于一个租户，所有查询与写入都在后端按 `tenant_id` 过滤，前端拿不到其他租户的数据。

## 技术栈

| 层 | 选型 |
| --- | --- |
| 前端 | React 18 + TypeScript + Vite + React Router |
| 后端 | Node.js 20 + Express 4 |
| 数据库 | SQLite（better-sqlite3，单文件、免安装） |
| 鉴权 | JWT + bcrypt 密码哈希 |

前后端在同一个 npm workspaces 仓库里，`npm install` 一次装齐。

## 目录结构

```
server/
  src/index.js        Express 入口、静态资源、生产模式托管前端
  src/db.js           SQLite 连接与建表
  src/auth.js         JWT 签发、鉴权中间件、角色校验
  src/helpers.js      时间段校验（不重叠 / 越界）、任务序列化
  src/routes/         auth / tasks / admin 三组 API
  src/seed.js         演示租户、账号、任务、历史提交数据
  public/videos/      演示视频（pusht-demo.mp4，40 秒）
web/
  src/pages/          登录、任务大厅、标注工作台、管理台三个页面
  src/components/     Timeline 时间轴、布局、弹窗、Toast 等
  src/lib/            API 封装、鉴权上下文、格式化
docs/CHALLENGE.md    原始题目
```

## 快速开始

要求 Node.js 18+（推荐 20）。

```bash
npm install

# 开发模式：API http://localhost:4000，前端 http://localhost:5173（Vite 代理 /api）
npm run dev

# 生产模式：构建前端后由 Express 一起托管，访问 http://localhost:4000
npm run build
npm start
```

首次启动会自动建库并写入演示数据。想重置数据：删除 `server/data/annotation.db*` 后重启，或执行 `npm run seed`（仅在库为空时写入）。

环境变量（可选）：`PORT`（默认 4000）、`JWT_SECRET`。

### 演示账号

| 角色 | 账号 / 密码 | 租户 | 说明 |
| --- | --- | --- | --- |
| 管理员 | `admin` / `admin123` | 星辰数据 | 发布任务、看统计、管理成员 |
| 标注员 | `lisi` / `123456` | 星辰数据 | 已有进行中任务和历史提交 |
| 标注员 | `wangwu` / `123456` | 星辰数据 | 有历史提交 |
| 管理员 | `admin2` / `admin123` | 蓝海智能 | 用来验证数据隔离 |
| 标注员 | `zhaoliu` / `123456` | 蓝海智能 | 只能看到本租户任务 |

### 演示视频

`server/public/videos/pusht-demo.mp4` 截取自 [LeRobot Push-T 数据集](https://huggingface.co/datasets/lerobot/pusht) 的前 40 秒（7 MB 原片截为 100 KB）。发布任务时可以选「视频链接」（本地示例或任意 http(s) 地址），也可以直接上传本地视频；时长留空时会由浏览器解码后回填。

### 视频上传

管理员在「发布任务」弹窗切到「上传视频」，支持 mp4 / webm / mov / m4v，单个文件不超过 200MB。

- 文件落盘在 `server/data/uploads/<租户 slug>/<uuid>.<ext>`，与数据库同目录，便于整体备份
- 元数据写入 `videos` 表（`tenant_id / storage_key / original_name / mime / size_bytes / duration_ms / created_by`），任务只保存引用
- 通过 `/media/...` 静态路由输出，支持 `Range` 请求，播放器可以拖动进度
- 删除未提交任务时会同时删除其上传的视频文件与记录；已提交任务的视频保留
- 上传前在浏览器侧读取视频时长，随文件一起提交，因此发布后时间轴即刻可用

生产环境如需多实例部署，把落盘换成对象存储（S3 / OSS / MinIO）即可，`storage_key` 的设计已经预留了这一层。

## 关键规则如何落地

- **时间段不重叠**：前端拖动时即按相邻片段边界钳制，保存/提交时后端 `parseSegments` 再次按开始时间排序并检查相邻区间，重叠直接返回 400。
- **有效时长**：只对 `status = 'submitted'` 的任务求和 `SUM(end_ms - start_ms)`，未提交任务的片段不计。
- **计入提交当天**：`tasks.submitted_at` 在提交时写入服务器本地时间，统计按 `date(submitted_at)` 分组。
- **租户隔离**：JWT 只携带用户 id，每次请求都从数据库重新加载用户及其 `tenant_id`；任务、片段、统计、成员查询全部带 `tenant_id` 条件。

## API 一览

```
POST   /api/auth/login                     登录，返回 JWT
GET    /api/auth/me                        当前用户

GET    /api/tasks                          本租户任务列表
GET    /api/tasks/:id                      任务详情（含片段）
POST   /api/tasks/:id/claim                领取任务
PUT    /api/tasks/:id/segments             整体替换片段（校验不重叠 / 越界 / 归属）
POST   /api/tasks/:id/submit               提交并锁定，写入提交时间
POST   /api/tasks/:id/video-meta           浏览器回填真实视频时长

GET    /api/admin/tasks                    本租户全部任务
POST   /api/admin/tasks                    发布任务（可用 videoUrl 或 videoId）
POST   /api/admin/videos                   上传视频（multipart，字段 file / durationMs）
DELETE /api/admin/tasks/:id                删除未提交任务，并清理其上传视频
GET    /api/admin/stats?from=&to=          按天有效时长与任务明细
GET    /api/admin/members                  本租户成员及累计工作量
POST   /api/admin/members                  新增成员
```

## 校验与自测

- `npm run build` 会先执行 `tsc --noEmit`，再做前端生产构建。
- 已通过接口级验证：重叠时间段返回 400、超出视频时长返回 400、跨租户任务返回 404、非本人不能改/提交、重复提交返回 409、统计只汇总已提交任务且日期正确。
- 已用浏览器走查标注员拖拽 / 自动保存 / 刷新持久化 / 提交确认，以及管理员发布、删除、统计展开、成员列表。

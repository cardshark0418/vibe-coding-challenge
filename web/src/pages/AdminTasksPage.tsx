import { useEffect, useMemo, useState, type ChangeEvent } from 'react';
import { Link } from 'react-router-dom';
import { api } from '../lib/api';
import type { Member, Task, TaskStatus, UploadedVideo } from '../lib/types';
import { formatDateTime, formatDuration } from '../lib/format';
import { EmptyState, Modal, PageLoader, Spinner, StatusBadge, useToast } from '../components/UI';
import { IconFilm, IconList, IconPlus, IconTrash } from '../components/Icons';

const STATUS_FILTERS: { key: 'all' | TaskStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '待领取' },
  { key: 'in_progress', label: '标注中' },
  { key: 'submitted', label: '已提交' },
];

const VIDEO_PRESETS = [
  { label: '本地示例（Push-T 40 秒）', url: '/videos/pusht-demo.mp4' },
  {
    label: 'ALOHA 做咖啡（HF）',
    url: 'https://huggingface.co/datasets/lerobot/aloha_static_coffee/resolve/main/videos/observation.images.cam_high/chunk-000/file-000.mp4',
  },
  {
    label: 'Push-T 原始（HF）',
    url: 'https://huggingface.co/datasets/lerobot/pusht/resolve/main/videos/observation.image/chunk-000/file-000.mp4',
  },
];

const MAX_VIDEO_BYTES = 200 * 1024 * 1024;
const VIDEO_EXT_RE = /\.(mp4|webm|mov|m4v)$/i;

function formatSize(bytes: number) {
  if (bytes >= 1024 * 1024) return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
  return `${Math.max(1, Math.round(bytes / 1024))} KB`;
}

function readVideoDuration(file: File) {
  return new Promise<number>((resolve) => {
    const url = URL.createObjectURL(file);
    const video = document.createElement('video');
    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      const ms = Math.round(video.duration * 1000);
      URL.revokeObjectURL(url);
      resolve(Number.isFinite(ms) ? ms : 0);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      resolve(0);
    };
    video.src = url;
  });
}

export default function AdminTasksPage() {
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const [createOpen, setCreateOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<Task | null>(null);
  const [saving, setSaving] = useState(false);
  const [videoMode, setVideoMode] = useState<'upload' | 'url'>('url');
  const [uploadedVideo, setUploadedVideo] = useState<UploadedVideo | null>(null);
  const [uploading, setUploading] = useState(false);

  const [form, setForm] = useState({
    title: '',
    description: '',
    videoUrl: '/videos/pusht-demo.mp4',
    durationSec: '',
    assigneeId: '',
  });

  const load = () => {
    api
      .adminTasks()
      .then((res) => setTasks(res.tasks))
      .catch((err) => {
        toast.show(err instanceof Error ? err.message : '加载任务失败', 'error');
        setTasks([]);
      });
    api
      .members()
      .then((res) => setMembers(res.members))
      .catch(() => undefined);
  };

  useEffect(load, []);

  const annotators = useMemo(() => members.filter((m) => m.role === 'annotator'), [members]);
  const counts = useMemo(() => {
    const base: Record<'all' | TaskStatus, number> = { all: tasks?.length ?? 0, open: 0, in_progress: 0, submitted: 0 };
    for (const task of tasks ?? []) base[task.status] += 1;
    return base;
  }, [tasks]);
  const visible = filter === 'all' ? tasks ?? [] : (tasks ?? []).filter((t) => t.status === filter);

  async function createTask() {
    if (!form.title.trim()) {
      toast.show('请填写任务标题', 'error');
      return;
    }
    if (videoMode === 'upload' && !uploadedVideo) {
      toast.show('请先上传视频文件', 'error');
      return;
    }
    if (videoMode === 'url' && !form.videoUrl.trim()) {
      toast.show('请填写视频地址', 'error');
      return;
    }
    setSaving(true);
    try {
      await api.createTask({
        title: form.title.trim(),
        description: form.description.trim(),
        videoUrl: videoMode === 'url' ? form.videoUrl.trim() : undefined,
        videoId: videoMode === 'upload' ? uploadedVideo?.id : undefined,
        durationMs: form.durationSec ? Math.round(Number(form.durationSec) * 1000) : 0,
        assigneeId: form.assigneeId ? Number(form.assigneeId) : null,
      });
      toast.show('任务已发布', 'success');
      setCreateOpen(false);
      setForm({ title: '', description: '', videoUrl: '/videos/pusht-demo.mp4', durationSec: '', assigneeId: '' });
      setUploadedVideo(null);
      setVideoMode('url');
      load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '发布失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  async function chooseVideo(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    if (!VIDEO_EXT_RE.test(file.name)) {
      toast.show('仅支持 mp4 / webm / mov / m4v 格式', 'error');
      return;
    }
    if (file.size > MAX_VIDEO_BYTES) {
      toast.show('视频不能超过 200MB', 'error');
      return;
    }

    setUploading(true);
    try {
      const durationMs = await readVideoDuration(file);
      const res = await api.uploadVideo(file, durationMs);
      setUploadedVideo(res.video);
      if (res.video.durationMs > 0) {
        setForm((prev) => ({ ...prev, durationSec: String(Math.round(res.video.durationMs / 100) / 10) }));
      }
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '视频上传失败', 'error');
    } finally {
      setUploading(false);
    }
  }

  async function removeTask() {
    if (!deleteTarget) return;
    setSaving(true);
    try {
      await api.deleteTask(deleteTarget.id);
      toast.show('任务已删除', 'success');
      setDeleteTarget(null);
      load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '删除失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="admin-head">
        <div>
          <p className="eyebrow">任务管理</p>
          <h1>标注任务</h1>
          <p className="page-sub">发布任务到指定租户，跟踪领取与提交情况。</p>
        </div>
        <button className="btn btn-primary" onClick={() => setCreateOpen(true)}>
          <IconPlus size={16} /> 发布任务
        </button>
      </header>

      <div className="admin-summary">
        <div className="summary-card">
          <small>全部任务</small>
          <strong>{counts.all}</strong>
        </div>
        <div className="summary-card">
          <small>待领取</small>
          <strong>{counts.open}</strong>
        </div>
        <div className="summary-card">
          <small>标注中</small>
          <strong>{counts.in_progress}</strong>
        </div>
        <div className="summary-card">
          <small>已提交</small>
          <strong>{counts.submitted}</strong>
        </div>
      </div>

      <div className="toolbar">
        <div className="segmented">
          {STATUS_FILTERS.map((item) => (
            <button
              key={item.key}
              className={`segment-btn${filter === item.key ? ' active' : ''}`}
              onClick={() => setFilter(item.key)}
            >
              {item.label}
              <span>{counts[item.key]}</span>
            </button>
          ))}
        </div>
      </div>

      <div className="table-card">
        {tasks === null ? (
          <PageLoader label="正在加载任务…" />
        ) : visible.length === 0 ? (
          <EmptyState icon={<IconList size={22} />} title="没有任务" description="发布一个任务，或切换筛选条件。" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>任务</th>
                <th>状态</th>
                <th>领取人</th>
                <th className="num">片段</th>
                <th className="num">有效时长</th>
                <th>发布时间</th>
                <th className="actions">操作</th>
              </tr>
            </thead>
            <tbody>
              {visible.map((task) => (
                <tr key={task.id}>
                  <td>
                    <div className="cell-title">
                      <Link to={`/tasks/${task.id}`} className="row-link">
                        <strong>{task.title}</strong>
                      </Link>
                      <span>#{String(task.id).padStart(3, '0')} · {task.description || '无说明'}</span>
                    </div>
                  </td>
                  <td><StatusBadge status={task.status} /></td>
                  <td>{task.assignee?.name ?? <span className="muted-text">未指派</span>}</td>
                  <td className="num">{task.segmentCount}</td>
                  <td className="num">{task.totalMs > 0 ? formatDuration(task.totalMs) : '—'}</td>
                  <td className="muted-text">{formatDateTime(task.createdAt)}</td>
                  <td className="actions">
                    <button
                      className="icon-btn danger"
                      title="删除任务"
                      disabled={task.status === 'submitted'}
                      onClick={() => setDeleteTarget(task)}
                    >
                      <IconTrash size={15} />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      {createOpen ? (
        <Modal
          title="发布标注任务"
          subtitle="任务只会在当前租户内可见，标注员领取后开始标注。"
          onClose={() => setCreateOpen(false)}
          width={600}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setCreateOpen(false)} disabled={saving}>
                取消
              </button>
              <button className="btn btn-primary" onClick={createTask} disabled={saving}>
                {saving ? '发布中…' : '发布任务'}
              </button>
            </>
          }
        >
          <label className="field">
            <span>任务标题</span>
            <input
              value={form.title}
              onChange={(e) => setForm({ ...form, title: e.target.value })}
              placeholder="例如：推方块 · 第 6 组片段"
            />
          </label>
          <label className="field">
            <span>任务说明（选填）</span>
            <textarea
              rows={3}
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
              placeholder="说明需要标注的动作范围、判定标准"
            />
          </label>

          <div className="field">
            <span>视频来源</span>
            <div className="segmented small">
              <button
                type="button"
                className={`segment-btn${videoMode === 'url' ? ' active' : ''}`}
                onClick={() => setVideoMode('url')}
              >
                视频链接
              </button>
              <button
                type="button"
                className={`segment-btn${videoMode === 'upload' ? ' active' : ''}`}
                onClick={() => setVideoMode('upload')}
              >
                上传视频
              </button>
            </div>
          </div>

          {videoMode === 'url' ? (
            <div className="field">
              <span>视频地址</span>
              <input
                value={form.videoUrl}
                onChange={(e) => setForm({ ...form, videoUrl: e.target.value })}
                placeholder="https://… 或 /videos/xxx.mp4"
              />
              <div className="preset-row">
                {VIDEO_PRESETS.map((preset) => (
                  <button
                    key={preset.url}
                    type="button"
                    className={`chip${form.videoUrl === preset.url ? ' active' : ''}`}
                    onClick={() => setForm({ ...form, videoUrl: preset.url })}
                  >
                    {preset.label}
                  </button>
                ))}
              </div>
            </div>
          ) : (
            <div className="upload-panel">
              {uploadedVideo ? (
                <>
                  <div className="upload-file">
                    <span className="upload-icon">
                      <IconFilm size={18} />
                    </span>
                    <span className="upload-meta">
                      <strong>{uploadedVideo.originalName}</strong>
                      <small>
                        {formatSize(uploadedVideo.sizeBytes)}
                        {uploadedVideo.durationMs > 0 ? ` · ${formatDuration(uploadedVideo.durationMs)}` : ''}
                      </small>
                    </span>
                    <button
                      type="button"
                      className="btn btn-ghost btn-small"
                      onClick={() => setUploadedVideo(null)}
                    >
                      移除
                    </button>
                  </div>
                  <video className="upload-preview" src={uploadedVideo.url} controls preload="metadata" />
                </>
              ) : (
                <label className="upload-drop">
                  {uploading ? <Spinner size={18} /> : <IconFilm size={20} />}
                  <strong>{uploading ? '正在上传…' : '选择视频文件'}</strong>
                  <small>支持 mp4 / webm / mov / m4v，最大 200MB</small>
                  <input
                    type="file"
                    accept="video/mp4,video/webm,video/quicktime,video/x-m4v"
                    onChange={chooseVideo}
                    disabled={uploading}
                  />
                </label>
              )}
            </div>
          )}

          <div className="form-row">
            <label className="field">
              <span>视频时长（秒，选填）</span>
              <input
                type="number"
                min={0}
                value={form.durationSec}
                onChange={(e) => setForm({ ...form, durationSec: e.target.value })}
                placeholder="留空则打开时自动读取"
              />
            </label>
            <label className="field">
              <span>指派给（选填）</span>
              <select value={form.assigneeId} onChange={(e) => setForm({ ...form, assigneeId: e.target.value })}>
                <option value="">不指派，所有人可领取</option>
                {annotators.map((member) => (
                  <option key={member.id} value={member.id}>
                    {member.name}（{member.username}）
                  </option>
                ))}
              </select>
            </label>
          </div>
        </Modal>
      ) : null}

      {deleteTarget ? (
        <Modal
          title="删除这个任务？"
          subtitle="任务下的时间段会一并删除，操作不可撤销。"
          onClose={() => setDeleteTarget(null)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setDeleteTarget(null)} disabled={saving}>
                取消
              </button>
              <button className="btn btn-danger" onClick={removeTask} disabled={saving}>
                {saving ? '删除中…' : '确认删除'}
              </button>
            </>
          }
        >
          <p className="confirm-tip">
            {deleteTarget.title} · {deleteTarget.segmentCount} 个片段
          </p>
        </Modal>
      ) : null}
    </>
  );
}

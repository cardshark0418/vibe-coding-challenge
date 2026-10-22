import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Segment, Task } from '../lib/types';
import { clamp, formatDateTime, formatDuration, formatTime } from '../lib/format';
import { AnnotatorLayout } from '../components/Layout';
import { Timeline } from '../components/Timeline';
import { Modal, PageLoader, StatusBadge, useToast } from '../components/UI';
import {
  IconArrowLeft,
  IconCheck,
  IconClock,
  IconPlay,
  IconPlus,
  IconScissors,
  IconTrash,
  IconUser,
} from '../components/Icons';

type SaveState = 'idle' | 'dirty' | 'saving' | 'saved' | 'error';

const MIN_GAP = 500;

function findGap(segments: Segment[], durationMs: number, timeMs: number) {
  const sorted = segments.slice().sort((a, b) => a.startMs - b.startMs);
  const gaps: { start: number; end: number }[] = [];
  let cursor = 0;
  for (const seg of sorted) {
    if (seg.startMs > cursor) gaps.push({ start: cursor, end: seg.startMs });
    cursor = Math.max(cursor, seg.endMs);
  }
  if (durationMs > cursor) gaps.push({ start: cursor, end: durationMs });

  const containing = gaps.find((gap) => timeMs >= gap.start - 50 && timeMs <= gap.end + 50);
  if (containing && containing.end - containing.start >= MIN_GAP) return containing;

  return gaps
    .filter((gap) => gap.end - gap.start >= MIN_GAP)
    .sort((a, b) => Math.abs(a.start - timeMs) - Math.abs(b.start - timeMs))[0] ?? null;
}

export default function TaskDetailPage() {
  const { id } = useParams();
  const taskId = Number(id);
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();

  const videoRef = useRef<HTMLVideoElement>(null);
  const [task, setTask] = useState<Task | null>(null);
  const [loadError, setLoadError] = useState('');
  const [segments, setSegments] = useState<Segment[]>([]);
  const [selected, setSelected] = useState<number | null>(null);
  const [videoDuration, setVideoDuration] = useState(0);
  const [currentTimeMs, setCurrentTimeMs] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [saveState, setSaveState] = useState<SaveState>('idle');
  const [claiming, setClaiming] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);

  const segmentsRef = useRef(segments);
  segmentsRef.current = segments;
  const initializedRef = useRef(false);
  const saveTimerRef = useRef<number | null>(null);
  const saveChainRef = useRef<Promise<unknown>>(Promise.resolve());

  const isAnnotator = user?.role === 'annotator';
  const isMine = !!task?.assignee && task.assignee.id === user?.id;
  const canEdit = isAnnotator && !!task && task.status !== 'submitted' && isMine;
  const canEditRef = useRef(canEdit);
  canEditRef.current = canEdit;
  const effectiveDuration = videoDuration || task?.durationMs || 0;
  const totalMs = segments.reduce((sum, seg) => sum + (seg.endMs - seg.startMs), 0);

  useEffect(() => {
    let cancelled = false;
    setTask(null);
    setLoadError('');
    api
      .task(taskId)
      .then((res) => {
        if (cancelled) return;
        setTask(res.task);
        setSegments(res.task.segments ?? []);
        setVideoDuration(res.task.durationMs || 0);
      })
      .catch((err) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : '任务加载失败');
      });
    return () => {
      cancelled = true;
    };
  }, [taskId]);

  // 播放时用 rAF 平滑驱动播放头
  useEffect(() => {
    if (!playing) return;
    let frame = 0;
    const loop = () => {
      const video = videoRef.current;
      if (video) setCurrentTimeMs(video.currentTime * 1000);
      frame = requestAnimationFrame(loop);
    };
    frame = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(frame);
  }, [playing]);

  const persist = useCallback(async (list: Segment[]) => {
    if (!Number.isFinite(taskId)) return;
    const run = async () => {
      const res = await api.saveSegments(taskId, list);
      setTask((prev) => (prev ? { ...prev, ...res.task, segments: prev.segments } : prev));
      setSaveState('saved');
    };
    saveChainRef.current = saveChainRef.current.then(run, run);
    await saveChainRef.current;
  }, [taskId]);

  const flushSave = useCallback(async () => {
    if (saveTimerRef.current) {
      window.clearTimeout(saveTimerRef.current);
      saveTimerRef.current = null;
    }
    setSaveState('saving');
    try {
      await persist(segmentsRef.current);
    } catch (err) {
      setSaveState('error');
      throw err;
    }
  }, [persist]);

  // 改动后自动保存（只跟随 segments 变化，避免保存后 task 更新触发循环）
  useEffect(() => {
    if (!canEditRef.current) return;
    if (!initializedRef.current) {
      initializedRef.current = true;
      return;
    }
    setSaveState('dirty');
    if (saveTimerRef.current) window.clearTimeout(saveTimerRef.current);
    saveTimerRef.current = window.setTimeout(() => {
      saveTimerRef.current = null;
      setSaveState('saving');
      persist(segmentsRef.current).catch(() => setSaveState('error'));
    }, 900);
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        saveTimerRef.current = null;
      }
    };
  }, [segments, persist]);

  // 卸载前尽力保存
  useEffect(() => {
    return () => {
      if (saveTimerRef.current) {
        window.clearTimeout(saveTimerRef.current);
        const list = segmentsRef.current;
        if (list.length > 0) {
          api.saveSegments(taskId, list).catch(() => undefined);
        }
      }
    };
  }, [taskId]);

  async function claim() {
    setClaiming(true);
    try {
      const res = await api.claim(taskId);
      setTask(res.task);
      setSegments(res.task.segments ?? []);
      toast.show('任务已领取，开始标片段吧', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '领取失败', 'error');
    } finally {
      setClaiming(false);
    }
  }

  const addAtCurrent = useCallback(() => {
    if (!canEdit || !effectiveDuration) return;
    const gap = findGap(segmentsRef.current, effectiveDuration, currentTimeMs);
    if (!gap) {
      toast.show('当前位置没有足够空隙，先调整或删除相邻片段', 'error');
      return;
    }
    const startMs = clamp(Math.round(currentTimeMs / 100) * 100, gap.start, gap.end - 1000);
    const endMs = Math.min(startMs + 2000, gap.end);
    if (endMs - startMs < 300) {
      toast.show('剩余空隙太小，无法新增片段', 'error');
      return;
    }
    const next = [...segmentsRef.current, { startMs, endMs }].sort((a, b) => a.startMs - b.startMs);
    setSegments(next);
    setSelected(next.findIndex((s) => s.startMs === startMs && s.endMs === endMs));
    toast.show('已新增 2 秒片段', 'success');
  }, [canEdit, effectiveDuration, currentTimeMs, toast]);

  const deleteSelected = useCallback(() => {
    if (!canEdit || selected === null) return;
    setSegments((prev) => prev.filter((_, index) => index !== selected));
    setSelected(null);
  }, [canEdit, selected]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || confirmOpen) return;
      const video = videoRef.current;
      if (!video) return;

      if (event.code === 'Space') {
        event.preventDefault();
        if (video.paused) video.play().catch(() => undefined);
        else video.pause();
      } else if (event.key.toLowerCase() === 'n' && canEdit) {
        event.preventDefault();
        addAtCurrent();
      } else if ((event.key === 'Delete' || event.key === 'Backspace') && canEdit) {
        if (selected !== null) {
          event.preventDefault();
          deleteSelected();
        }
      } else if (event.key === 'ArrowLeft' || event.key === 'ArrowRight') {
        event.preventDefault();
        const delta = (event.key === 'ArrowLeft' ? -1 : 1) * (event.shiftKey ? 5000 : 1000);
        video.currentTime = clamp(video.currentTime + delta / 1000, 0, effectiveDuration / 1000);
        setCurrentTimeMs(video.currentTime * 1000);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [addAtCurrent, canEdit, confirmOpen, deleteSelected, effectiveDuration, selected]);

  function seek(ms: number) {
    const video = videoRef.current;
    if (video) video.currentTime = clamp(ms, 0, effectiveDuration) / 1000;
    setCurrentTimeMs(clamp(ms, 0, effectiveDuration));
  }

  async function handleSubmit() {
    setSubmitting(true);
    try {
      await flushSave();
      const res = await api.submit(taskId);
      setTask(res.task);
      setSegments(res.task.segments ?? []);
      setConfirmOpen(false);
      toast.show('任务已提交，有效时长已计入今天', 'success');
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '提交失败', 'error');
    } finally {
      setSubmitting(false);
    }
  }

  const saveLabel = useMemo(() => {
    if (saveState === 'dirty') return '未保存';
    if (saveState === 'saving') return '保存中…';
    if (saveState === 'error') return '保存失败';
    if (saveState === 'saved') return '已自动保存';
    return canEdit ? '所有修改会自动保存' : '';
  }, [saveState, canEdit]);

  if (loadError) {
    return (
      <AnnotatorLayout>
        <div className="page-narrow">
          <Link to="/tasks" className="back-link">
            <IconArrowLeft size={16} /> 返回任务大厅
          </Link>
          <div className="error-panel">
            <h2>打开任务失败</h2>
            <p>{loadError}</p>
            <button className="btn btn-ghost" onClick={() => navigate('/tasks')}>
              回到任务大厅
            </button>
          </div>
        </div>
      </AnnotatorLayout>
    );
  }

  if (!task) {
    return (
      <AnnotatorLayout>
        <PageLoader label="正在准备标注工作台…" />
      </AnnotatorLayout>
    );
  }

  const readOnly = !canEdit;

  return (
    <AnnotatorLayout>
      <div className="detail-head">
        <div className="detail-head-left">
          <Link to={user?.role === 'admin' ? '/admin' : '/tasks'} className="back-link">
            <IconArrowLeft size={16} /> {user?.role === 'admin' ? '返回管理台' : '返回任务大厅'}
          </Link>
          <div className="detail-title-row">
            <h1>{task.title}</h1>
            <StatusBadge status={task.status} />
          </div>
          <p className="detail-sub">
            <span className="task-id">#{String(task.id).padStart(3, '0')}</span>
            {task.description || '暂无补充说明'}
          </p>
          <div className="detail-meta">
            <span>
              <IconUser size={14} /> {task.assignee ? task.assignee.name : '未指派'}
            </span>
            <span>
              <IconClock size={14} /> {task.submittedAt ? `提交于 ${formatDateTime(task.submittedAt)}` : `发布于 ${formatDateTime(task.createdAt)}`}
            </span>
            <span>
              <IconScissors size={14} /> {segments.length} 个片段 · {formatDuration(totalMs)}
            </span>
          </div>
        </div>

        <div className="detail-actions">
          {canEdit || saveState === 'error' ? (
            <span className={`save-state ${saveState}`}>
              <i className="status-dot" />
              {saveLabel}
              {saveState === 'error' ? (
                <button className="link-btn" onClick={() => flushSave().catch(() => undefined)}>
                  重试
                </button>
              ) : null}
            </span>
          ) : null}

          {task.status === 'open' && isAnnotator ? (
            <button className="btn btn-primary" onClick={claim} disabled={claiming}>
              {claiming ? '领取中…' : '领取并开始标注'}
            </button>
          ) : null}

          {canEdit ? (
            <button
              className="btn btn-primary"
              onClick={() => setConfirmOpen(true)}
              disabled={segments.length === 0}
            >
              <IconCheck size={16} /> 提交任务
            </button>
          ) : null}

          {task.status === 'submitted' ? (
            <span className="readonly-pill">
              <IconCheck size={15} /> 已提交，结果已锁定
            </span>
          ) : null}
        </div>
      </div>

      {!canEdit && task.status !== 'submitted' && !isAnnotator ? (
        <div className="notice">管理员为只读视图，标注操作请在标注员账号下进行。</div>
      ) : null}
      {!canEdit && task.status !== 'submitted' && isAnnotator && !isMine ? (
        <div className="notice">任务已被 {task.assignee?.name ?? '其他标注员'} 领取，你可以查看但不能修改。</div>
      ) : null}

      <div className="workspace">
        <section className="stage">
          <div className="video-frame">
            <video
              ref={videoRef}
              src={task.videoUrl}
              controls
              preload="metadata"
              onLoadedMetadata={(event) => {
                const video = event.currentTarget;
                const duration = Math.round(video.duration * 1000);
                if (!Number.isFinite(duration) || duration <= 0) return;
                setVideoDuration(duration);
                if (
                  Math.abs(duration - (task.durationMs || 0)) > 1000 &&
                  (isMine || user?.role === 'admin')
                ) {
                  api.reportVideoMeta(taskId, duration).catch(() => undefined);
                }
              }}
              onTimeUpdate={(event) => setCurrentTimeMs(event.currentTarget.currentTime * 1000)}
              onPlay={() => setPlaying(true)}
              onPause={() => setPlaying(false)}
              onEnded={() => setPlaying(false)}
            />
          </div>

          <div className="stage-toolbar">
            <div className="toolbar-left">
              <button className="icon-btn solid" onClick={() => videoRef.current?.play()} title="播放">
                <IconPlay size={16} />
              </button>
              <div className="time-readout">
                <strong>{formatTime(currentTimeMs)}</strong>
                <span>/ {effectiveDuration ? formatTime(effectiveDuration) : '--:--'}</span>
              </div>
            </div>
            <div className="toolbar-right">
              <span className="kbd-hint">
                <kbd>Space</kbd> 播放
              </span>
              <span className="kbd-hint">
                <kbd>N</kbd> 新增片段
              </span>
              <span className="kbd-hint">
                <kbd>Del</kbd> 删除
              </span>
              {canEdit ? (
                <button className="btn btn-ghost btn-small" onClick={addAtCurrent}>
                  <IconPlus size={15} /> 在当前位置新增
                </button>
              ) : null}
            </div>
          </div>

          {effectiveDuration ? (
            <Timeline
              durationMs={effectiveDuration}
              segments={segments}
              selectedIndex={selected}
              currentTimeMs={currentTimeMs}
              readOnly={readOnly || !effectiveDuration}
              onChange={setSegments}
              onSelect={setSelected}
              onSeek={seek}
            />
          ) : (
            <div className="timeline-placeholder">视频时长读取中…如果长时间无响应，请检查视频地址是否可访问。</div>
          )}

          <div className="clip-strip">
            <div className="clip-strip-head">
              <h3>片段列表</h3>
              <span>{segments.length} 段 · 合计 {formatDuration(totalMs)}</span>
            </div>

            {segments.length === 0 ? (
              <div className="clip-empty">
                <IconScissors size={18} />
                <span>{canEdit ? '在时间轴上按住拖动，或在当前位置按 N 新增片段' : '这个任务还没有片段'}</span>
              </div>
            ) : (
              <ul className="clip-list">
                {segments.map((seg, index) => (
                  <li
                    key={`${index}-${seg.startMs}`}
                    className={`clip-row${selected === index ? ' active' : ''}`}
                    onClick={() => {
                      setSelected(index);
                      seek(seg.startMs);
                    }}
                  >
                    <span className="clip-index">{String(index + 1).padStart(2, '0')}</span>
                    <span className="clip-range">
                      {formatTime(seg.startMs)} <em>→</em> {formatTime(seg.endMs)}
                    </span>
                    <span className="clip-len">{formatDuration(seg.endMs - seg.startMs)}</span>
                    <button
                      className="icon-btn"
                      title="定位到此片段"
                      onClick={(event) => {
                        event.stopPropagation();
                        setSelected(index);
                        seek(seg.startMs);
                      }}
                    >
                      <IconPlay size={14} />
                    </button>
                    {canEdit ? (
                      <button
                        className="icon-btn danger"
                        title="删除片段"
                        onClick={(event) => {
                          event.stopPropagation();
                          setSegments((prev) => prev.filter((_, i) => i !== index));
                          setSelected(null);
                        }}
                      >
                        <IconTrash size={15} />
                      </button>
                    ) : null}
                  </li>
                ))}
              </ul>
            )}
          </div>
        </section>

        <aside className="side-panel">
          <div className="panel-card">
            <h3>标注规范</h3>
            <ul className="rule-list">
              <li>同一个任务里的时间段不能重叠，提交时后端会再次校验。</li>
              <li>有效时长 = 已提交任务中所有片段长度之和，未提交不计。</li>
              <li>提交后结果锁定，时长计入提交当天（{new Date().toLocaleDateString('zh-CN')}）。</li>
            </ul>
          </div>

          <div className="panel-card">
            <h3>本次标注</h3>
            <div className="summary-grid">
              <div>
                <small>片段数</small>
                <strong>{segments.length}</strong>
              </div>
              <div>
                <small>有效时长</small>
                <strong>{formatDuration(totalMs)}</strong>
              </div>
            </div>
            <div className="summary-bar">
              <span
                style={{
                  width: `${effectiveDuration ? Math.min(100, (totalMs / effectiveDuration) * 100) : 0}%`,
                }}
              />
            </div>
            <p className="summary-note">
              已覆盖视频的 {effectiveDuration ? ((totalMs / effectiveDuration) * 100).toFixed(1) : '0'}%
            </p>

            {canEdit ? (
              <button
                className="btn btn-danger-ghost btn-block"
                onClick={deleteSelected}
                disabled={selected === null}
              >
                <IconTrash size={15} /> 删除选中片段
              </button>
            ) : null}
          </div>

          <div className="panel-card muted">
            <h3>状态</h3>
            <div className="kv">
              <span>任务状态</span>
              <b>{task.status === 'open' ? '待领取' : task.status === 'in_progress' ? '标注中' : '已提交'}</b>
            </div>
            <div className="kv">
              <span>所属租户</span>
              <b>{user?.tenant.name}</b>
            </div>
            <div className="kv">
              <span>领取人</span>
              <b>{task.assignee?.name ?? '未指派'}</b>
            </div>
            <div className="kv">
              <span>视频分辨率</span>
              <b>{videoRef.current?.videoWidth ?? '—'} × {videoRef.current?.videoHeight ?? '—'}</b>
            </div>
          </div>
        </aside>
      </div>

      {confirmOpen ? (
        <Modal
          title="确认提交任务？"
          subtitle="提交后时间段将锁定，不能再修改。"
          onClose={() => setConfirmOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setConfirmOpen(false)} disabled={submitting}>
                再检查一下
              </button>
              <button className="btn btn-primary" onClick={handleSubmit} disabled={submitting}>
                {submitting ? '提交中…' : '确认提交'}
              </button>
            </>
          }
        >
          <div className="confirm-summary">
            <div>
              <small>片段数量</small>
              <strong>{segments.length}</strong>
            </div>
            <div>
              <small>有效时长</small>
              <strong>{formatDuration(totalMs)}</strong>
            </div>
            <div>
              <small>计入日期</small>
              <strong>今天</strong>
            </div>
          </div>
          <p className="confirm-tip">
            提交后，这 {formatDuration(totalMs)} 会出现在管理员「工作量统计」的今天数据里。
          </p>
        </Modal>
      ) : null}
    </AnnotatorLayout>
  );
}

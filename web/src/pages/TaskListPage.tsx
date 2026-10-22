import { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { useAuth } from '../lib/auth';
import type { Task, TaskStatus } from '../lib/types';
import { formatDuration, formatDateTime } from '../lib/format';
import { AnnotatorLayout } from '../components/Layout';
import { EmptyState, PageLoader, StatusBadge, useToast } from '../components/UI';
import { IconClock, IconFilm, IconList, IconScissors } from '../components/Icons';

const FILTERS: { key: 'all' | TaskStatus; label: string }[] = [
  { key: 'all', label: '全部' },
  { key: 'open', label: '待领取' },
  { key: 'in_progress', label: '标注中' },
  { key: 'submitted', label: '已提交' },
];

function actionLabel(task: Task, userId: number, isAdmin: boolean) {
  if (isAdmin) return '查看详情';
  if (task.status === 'submitted') return '查看结果';
  if (task.status === 'open') return '领取任务';
  if (task.assignee?.id === userId) return '继续标注';
  return '查看详情';
}

export default function TaskListPage() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const toast = useToast();
  const [tasks, setTasks] = useState<Task[] | null>(null);
  const [filter, setFilter] = useState<'all' | TaskStatus>('all');
  const [keyword, setKeyword] = useState('');
  const [claiming, setClaiming] = useState<number | null>(null);

  const load = () => {
    api
      .tasks()
      .then((res) => setTasks(res.tasks))
      .catch((err) => {
        toast.show(err instanceof Error ? err.message : '加载任务失败', 'error');
        setTasks([]);
      });
  };

  useEffect(load, []);

  const counts = useMemo(() => {
    const base: Record<'all' | TaskStatus, number> = { all: tasks?.length ?? 0, open: 0, in_progress: 0, submitted: 0 };
    for (const task of tasks ?? []) base[task.status] += 1;
    return base;
  }, [tasks]);

  const visible = useMemo(() => {
    const list = tasks ?? [];
    const byFilter = filter === 'all' ? list : list.filter((task) => task.status === filter);
    const kw = keyword.trim().toLowerCase();
    if (!kw) return byFilter;
    return byFilter.filter(
      (task) => task.title.toLowerCase().includes(kw) || task.description.toLowerCase().includes(kw)
    );
  }, [tasks, filter, keyword]);

  async function handleClaim(event: React.MouseEvent, task: Task) {
    event.stopPropagation();
    if (!user || user.role !== 'annotator' || task.status !== 'open') {
      navigate(`/tasks/${task.id}`);
      return;
    }
    setClaiming(task.id);
    try {
      await api.claim(task.id);
      toast.show('任务已领取，开始标注吧', 'success');
      navigate(`/tasks/${task.id}`);
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '领取失败', 'error');
      load();
    } finally {
      setClaiming(null);
    }
  }

  const mySubmitted = (tasks ?? []).filter((t) => t.status === 'submitted' && t.assignee?.id === user?.id).length;
  const inProgress = (tasks ?? []).filter((t) => t.status === 'in_progress').length;
  const totalDuration = (tasks ?? []).reduce((sum, t) => sum + t.totalMs, 0);

  return (
    <AnnotatorLayout>
      <section className="page-head">
        <div>
          <p className="eyebrow">任务大厅</p>
          <h1>你好，{user?.name}</h1>
          <p className="page-sub">
            {user?.tenant.name} · 今天也可以把每一段有效动作标清楚
          </p>
        </div>
        <div className="head-stats">
          <div className="mini-stat">
            <span className="mini-stat-icon accent">
              <IconScissors size={16} />
            </span>
            <div>
              <small>待领取</small>
              <strong>{counts.open}</strong>
            </div>
          </div>
          <div className="mini-stat">
            <span className="mini-stat-icon warn">
              <IconClock size={16} />
            </span>
            <div>
              <small>标注中</small>
              <strong>{inProgress}</strong>
            </div>
          </div>
          <div className="mini-stat">
            <span className="mini-stat-icon success">
              <IconFilm size={16} />
            </span>
            <div>
              <small>我的已提交</small>
              <strong>{mySubmitted}</strong>
            </div>
          </div>
        </div>
      </section>

      <div className="toolbar">
        <div className="segmented">
          {FILTERS.map((item) => (
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
        <div className="toolbar-right">
          <input
            className="search-input"
            value={keyword}
            onChange={(e) => setKeyword(e.target.value)}
            placeholder="搜索任务标题或说明"
          />
        </div>
      </div>

      {tasks === null ? (
        <PageLoader label="正在加载任务…" />
      ) : visible.length === 0 ? (
        <EmptyState
          icon={<IconList size={22} />}
          title={keyword || filter !== 'all' ? '没有符合条件的任务' : '这里还没有任务'}
          description={
            keyword || filter !== 'all'
              ? '换一个筛选条件或清空搜索关键词试试。'
              : '管理员发布任务后，会出现在这里。'
          }
        />
      ) : (
        <div className="task-grid">
          {visible.map((task) => {
            const mine = task.assignee?.id === user?.id;
            const action = actionLabel(task, user?.id ?? 0, user?.role === 'admin');
            return (
              <article
                key={task.id}
                className={`task-card status-${task.status}`}
                onClick={() => navigate(`/tasks/${task.id}`)}
                tabIndex={0}
                onKeyDown={(e) => e.key === 'Enter' && navigate(`/tasks/${task.id}`)}
              >
                <div className="task-cover">
                  <span className="cover-grid" />
                  <IconFilm size={26} />
                  <span className="cover-duration">
                    {task.durationMs > 0 ? formatDuration(task.durationMs) : task.totalMs > 0 ? `已标 ${formatDuration(task.totalMs)}` : '时长待读取'}
                  </span>
                  <StatusBadge status={task.status} />
                </div>

                <div className="task-body">
                  <div className="task-title-row">
                    <h3>{task.title}</h3>
                    <span className="task-id">#{String(task.id).padStart(3, '0')}</span>
                  </div>
                  <p className="task-desc">{task.description || '暂无补充说明'}</p>

                  <div className="task-meta">
                    <span>
                      <IconScissors size={14} />
                      {task.segmentCount} 个片段
                    </span>
                    <span>
                      <IconClock size={14} />
                      {task.totalMs > 0 ? formatDuration(task.totalMs) : '尚未标注'}
                    </span>
                  </div>

                  <div className="task-foot">
                    <span className={`assignee${mine ? ' mine' : ''}`}>
                      {task.assignee ? (
                        <>
                          <span className="avatar tiny">{task.assignee.name.slice(0, 1)}</span>
                          {mine ? '我' : task.assignee.name}
                        </>
                      ) : (
                        '未指派'
                      )}
                      <span className="dot">·</span>
                      {formatDateTime(task.createdAt)}
                    </span>
                    <button
                      className={`btn btn-small ${task.status === 'open' ? 'btn-primary' : 'btn-ghost'}`}
                      onClick={(event) => handleClaim(event, task)}
                      disabled={claiming === task.id}
                    >
                      {claiming === task.id ? '领取中…' : action}
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="list-footnote">
        <span>本页共 {visible.length} 个任务</span>
        <span>已完成片段总时长 {formatDuration(totalDuration)}</span>
      </div>
    </AnnotatorLayout>
  );
}

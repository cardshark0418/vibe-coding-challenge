import { Fragment, useEffect, useMemo, useState } from 'react';
import { api } from '../lib/api';
import type { Member, StatsResponse } from '../lib/types';
import { formatDuration, formatHours } from '../lib/format';
import { EmptyState, PageLoader, useToast } from '../components/UI';
import { IconChart, IconClock, IconScissors, IconUsers } from '../components/Icons';

function dateString(offsetDays: number) {
  const date = new Date();
  date.setDate(date.getDate() + offsetDays);
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

const PRESETS = [
  { key: 7, label: '近 7 天' },
  { key: 14, label: '近 14 天' },
  { key: 30, label: '近 30 天' },
];

export default function AdminStatsPage() {
  const toast = useToast();
  const [from, setFrom] = useState(dateString(-13));
  const [to, setTo] = useState(dateString(0));
  const [data, setData] = useState<StatsResponse | null>(null);
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [activePreset, setActivePreset] = useState(14);
  const [annotators, setAnnotators] = useState<Member[]>([]);
  const [annotatorId, setAnnotatorId] = useState(0);

  const load = (nextFrom = from, nextTo = to, nextAnnotatorId = annotatorId) => {
    setLoading(true);
    api
      .stats(nextFrom, nextTo, nextAnnotatorId || null)
      .then((res) => setData(res))
      .catch((err) => toast.show(err instanceof Error ? err.message : '加载统计失败', 'error'))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load(from, to);
    api
      .members()
      .then((res) => setAnnotators(res.members.filter((member) => member.role === 'annotator')))
      .catch(() => undefined);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function applyPreset(days: number) {
    const nextFrom = dateString(-(days - 1));
    const nextTo = dateString(0);
    setActivePreset(days);
    setFrom(nextFrom);
    setTo(nextTo);
    load(nextFrom, nextTo);
  }

  const chart = useMemo(() => {
    if (!data) return [];
    const max = Math.max(...data.days.map((day) => day.totalMs), 1);
    return data.days
      .slice()
      .reverse()
      .map((day) => ({
        ...day,
        height: day.totalMs > 0 ? Math.max(6, (day.totalMs / max) * 100) : 0,
        hours: formatHours(day.totalMs),
      }));
  }, [data]);

  const today = dateString(0);
  const todayStat = data?.days.find((day) => day.date === today);

  return (
    <>
      <header className="admin-head">
        <div>
          <p className="eyebrow">工作量统计</p>
          <h1>每日有效时长</h1>
          <p className="page-sub">
            {data?.annotator
              ? `仅统计 ${data.annotator.name} 的已提交任务，时长计入提交当天。`
              : '仅统计已提交任务，时长计入提交当天。'}
          </p>
        </div>
        <div className="range-controls">
          <select
            className="filter-select"
            value={annotatorId}
            aria-label="按标注员筛选"
            onChange={(e) => {
              const nextId = Number(e.target.value);
              setAnnotatorId(nextId);
              load(from, to, nextId);
            }}
          >
            <option value={0}>全部标注员</option>
            {annotators.map((annotator) => (
              <option key={annotator.id} value={annotator.id}>
                {annotator.name}
              </option>
            ))}
          </select>
          <div className="segmented small">
            {PRESETS.map((preset) => (
              <button
                key={preset.key}
                className={`segment-btn${activePreset === preset.key ? ' active' : ''}`}
                onClick={() => applyPreset(preset.key)}
              >
                {preset.label}
              </button>
            ))}
          </div>
          <div className="date-range">
            <input
              type="date"
              value={from}
              max={to}
              onChange={(e) => {
                setFrom(e.target.value);
                setActivePreset(0);
              }}
            />
            <span>至</span>
            <input
              type="date"
              value={to}
              min={from}
              max={today}
              onChange={(e) => {
                setTo(e.target.value);
                setActivePreset(0);
              }}
            />
            <button className="btn btn-ghost btn-small" onClick={() => load()} disabled={loading}>
              应用
            </button>
          </div>
        </div>
      </header>

      {loading && !data ? (
        <PageLoader label="正在汇总有效时长…" />
      ) : data ? (
        <>
          <div className="stats-cards">
            <div className="stat-card featured">
              <span className="stat-icon">
                <IconClock size={18} />
              </span>
              <small>区间有效时长</small>
              <strong>{formatHours(data.totals.totalMs)}<em>小时</em></strong>
              <span className="stat-note">{formatDuration(data.totals.totalMs)}</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">
                <IconScissors size={18} />
              </span>
              <small>已提交任务</small>
              <strong>{data.totals.taskCount}</strong>
              <span className="stat-note">提交后即锁定</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">
                <IconUsers size={18} />
              </span>
              <small>参与标注员</small>
              <strong>{data.totals.annotatorCount}</strong>
              <span className="stat-note">{data.annotator ? '当前筛选' : '按提交任务去重'}</span>
            </div>
            <div className="stat-card">
              <span className="stat-icon">
                <IconChart size={18} />
              </span>
              <small>今日有效时长</small>
              <strong>{formatHours(todayStat?.totalMs ?? 0)}<em>小时</em></strong>
              <span className="stat-note">{todayStat?.taskCount ?? 0} 个任务</span>
            </div>
          </div>

          <section className="chart-card">
            <div className="chart-head">
              <div>
                <h3>每日趋势</h3>
                <p>{data.range.from} 至 {data.range.to}</p>
              </div>
              <span className="chart-legend">
                <i /> 有效时长（小时）
              </span>
            </div>
            <div className="chart">
              {chart.map((day, index) => (
                <div
                  key={day.date}
                  className={`chart-col${day.date === today ? ' today' : ''}`}
                  title={`${day.date} · ${day.hours} 小时 · ${day.taskCount} 个任务`}
                >
                  <span className="chart-value">{day.totalMs > 0 ? day.hours : ''}</span>
                  <div className="chart-bar-wrap">
                    <div className="chart-bar" style={{ height: `${day.height}%` }} />
                  </div>
                  <span className="chart-label">
                    {index % Math.ceil(chart.length / 10) === 0 ? day.date.slice(5) : ''}
                  </span>
                </div>
              ))}
            </div>
          </section>

          <section className="table-card">
            <div className="section-head">
              <h3>按天明细</h3>
              <span>{data.days.length} 天</span>
            </div>
            {data.days.length === 0 ? (
              <EmptyState title="这个区间没有提交记录" description="换一个时间范围，或等标注员提交任务后再来看。" />
            ) : (
              <table className="data-table">
                <thead>
                  <tr>
                    <th>日期</th>
                    <th className="num">有效时长</th>
                    <th className="num">任务数</th>
                    <th className="num">标注员</th>
                    <th className="actions">明细</th>
                  </tr>
                </thead>
                <tbody>
                  {data.days.map((day) => (
                    <Fragment key={day.date}>
                      <tr
                        className={`clickable${expanded === day.date ? ' expanded' : ''}`}
                        onClick={() => setExpanded(expanded === day.date ? null : day.date)}
                      >
                        <td>
                          <strong>{day.date}</strong>
                          {day.date === today ? <span className="today-tag">今天</span> : null}
                        </td>
                        <td className="num">
                          {day.totalMs > 0 ? <b>{formatHours(day.totalMs)} h</b> : <span className="muted-text">0</span>}
                        </td>
                        <td className="num">{day.taskCount}</td>
                        <td className="num">{day.annotatorCount}</td>
                        <td className="actions">
                          {day.taskCount > 0 ? (
                            <span className="expand-hint">{expanded === day.date ? '收起' : '展开'}</span>
                          ) : (
                            <span className="muted-text">—</span>
                          )}
                        </td>
                      </tr>
                      {expanded === day.date ? (
                        <tr className="detail-row">
                          <td colSpan={5}>
                            <div className="day-detail">
                              {day.tasks.map((task) => (
                                <div key={task.id} className="day-task">
                                  <span className="day-task-title">
                                    #{String(task.id).padStart(3, '0')} {task.title}
                                  </span>
                                  <span className="day-task-assignee">{task.assignee}</span>
                                  <span className="day-task-duration">{formatDuration(task.totalMs)}</span>
                                </div>
                              ))}
                            </div>
                          </td>
                        </tr>
                      ) : null}
                    </Fragment>
                  ))}
                </tbody>
              </table>
            )}
          </section>
        </>
      ) : null}
    </>
  );
}

export function pad(n: number, size = 2) {
  return String(Math.floor(n)).padStart(size, '0');
}

/** 毫秒 -> mm:ss.mmm 或 hh:mm:ss.mmm */
export function formatTime(ms: number, withMs = true) {
  const safe = Math.max(0, Math.round(ms));
  const hours = Math.floor(safe / 3_600_000);
  const minutes = Math.floor((safe % 3_600_000) / 60_000);
  const seconds = Math.floor((safe % 60_000) / 1000);
  const millis = safe % 1000;
  const base = hours > 0
    ? `${hours}:${pad(minutes)}:${pad(seconds)}`
    : `${pad(minutes)}:${pad(seconds)}`;
  return withMs ? `${base}.${pad(millis, 3)}` : base;
}

/** 毫秒 -> 01:23（用于时间轴刻度） */
export function formatClock(ms: number) {
  return formatTime(ms, false);
}

/** 毫秒 -> 中文可读时长 */
export function formatDuration(ms: number) {
  const totalSeconds = Math.round(ms / 1000);
  if (totalSeconds < 60) return `${totalSeconds} 秒`;
  const hours = Math.floor(totalSeconds / 3600);
  const minutes = Math.floor((totalSeconds % 3600) / 60);
  const seconds = totalSeconds % 60;
  if (hours > 0) return `${hours} 小时 ${minutes} 分`;
  return seconds > 0 ? `${minutes} 分 ${seconds} 秒` : `${minutes} 分`;
}

/** 毫秒 -> 小时数，保留两位小数 */
export function formatHours(ms: number) {
  return (ms / 3_600_000).toFixed(2);
}

/** "2026-10-22 14:08:54" -> "10-22 14:08" */
export function formatDateTime(value?: string | null) {
  if (!value) return '—';
  return value.slice(5, 16).replace(' ', ' ');
}

export function clamp(value: number, min: number, max: number) {
  return Math.min(Math.max(value, min), max);
}

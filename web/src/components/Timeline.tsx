import { useEffect, useRef, useState } from 'react';
import type { Segment } from '../lib/types';
import { clamp, formatClock, formatTime } from '../lib/format';

const MIN_SEGMENT_MS = 300;
const SNAP_MS = 100;

interface TimelineProps {
  durationMs: number;
  segments: Segment[];
  selectedIndex: number | null;
  currentTimeMs: number;
  readOnly?: boolean;
  onChange: (segments: Segment[]) => void;
  onSelect: (index: number | null) => void;
  onSeek: (ms: number) => void;
}

type Draft = { startMs: number; endMs: number } | null;

type Drag =
  | { kind: 'create'; anchorMs: number; gapStart: number; gapEnd: number; rect: DOMRect }
  | {
      kind: 'move';
      index: number;
      grabMs: number;
      startMs: number;
      endMs: number;
      minStart: number;
      maxStart: number;
      moved: boolean;
      rect: DOMRect;
    }
  | {
      kind: 'resize';
      edge: 'start' | 'end';
      index: number;
      startMs: number;
      endMs: number;
      min: number;
      max: number;
      moved: boolean;
      rect: DOMRect;
    };

function snap(ms: number) {
  return Math.round(ms / SNAP_MS) * SNAP_MS;
}

function chooseTickStep(durationMs: number) {
  const steps = [500, 1000, 2000, 5000, 10_000, 15_000, 30_000, 60_000, 120_000, 300_000, 600_000, 900_000];
  return steps.find((step) => durationMs / step <= 9) ?? 1_800_000;
}

export function Timeline({
  durationMs,
  segments,
  selectedIndex,
  currentTimeMs,
  readOnly = false,
  onChange,
  onSelect,
  onSeek,
}: TimelineProps) {
  const trackRef = useRef<HTMLDivElement>(null);
  const [draft, setDraft] = useState<Draft>(null);
  const [hoverTime, setHoverTime] = useState<number | null>(null);
  const propsRef = useRef({ segments, onChange, onSelect, onSeek, durationMs, readOnly });
  propsRef.current = { segments, onChange, onSelect, onSeek, durationMs, readOnly };

  const safeDuration = Math.max(durationMs, 1000);
  const tickStep = chooseTickStep(safeDuration);
  const ticks: number[] = [];
  for (let t = 0; t <= safeDuration; t += tickStep) ticks.push(t);

  const percentOf = (ms: number) => `${(clamp(ms, 0, safeDuration) / safeDuration) * 100}%`;

  function timeFromClientX(clientX: number, rect: DOMRect) {
    if (rect.width === 0) return 0;
    return clamp(((clientX - rect.left) / rect.width) * safeDuration, 0, safeDuration);
  }

  function startCreateGap(anchorMs: number) {
    const list = propsRef.current.segments;
    let gapStart = 0;
    let gapEnd = safeDuration;
    for (const seg of list) {
      if (seg.endMs <= anchorMs) gapStart = Math.max(gapStart, seg.endMs);
      if (seg.startMs >= anchorMs) gapEnd = Math.min(gapEnd, seg.startMs);
      if (seg.startMs < anchorMs && seg.endMs > anchorMs) return null;
    }
    return { gapStart, gapEnd };
  }

  const dragging = useRef<Drag | null>(null);

  const handlePointerMove = (event: PointerEvent) => {
    const drag = dragging.current;
    if (!drag) return;
    const ms = timeFromClientX(event.clientX, drag.rect);
    const { segments: list, onChange: change } = propsRef.current;

    if (drag.kind === 'create') {
      const end = clamp(snap(ms), drag.gapStart, drag.gapEnd);
      const start = clamp(drag.anchorMs, drag.gapStart, drag.gapEnd);
      const nextDraft = { startMs: Math.min(start, end), endMs: Math.max(start, end) };
      draftRef.current = nextDraft;
      setDraft(nextDraft);
      return;
    }

    if (drag.kind === 'move') {
      const offset = snap(ms) - drag.grabMs;
      const rawStart = drag.startMs + offset;
      let start = clamp(Math.round(rawStart / SNAP_MS) * SNAP_MS, drag.minStart, drag.maxStart);
      start = Math.max(start, 0);
      const length = drag.endMs - drag.startMs;
      drag.moved = drag.moved || Math.abs(start - drag.startMs) > 30;
      const next = list.slice();
      next[drag.index] = { ...next[drag.index], startMs: start, endMs: start + length };
      change(next);
      return;
    }

    if (drag.kind === 'resize') {
      drag.moved = true;
      const next = list.slice();
      if (drag.edge === 'start') {
        const start = clamp(snap(ms), drag.min, drag.endMs - MIN_SEGMENT_MS);
        next[drag.index] = { ...next[drag.index], startMs: start, endMs: drag.endMs };
      } else {
        const end = clamp(snap(ms), drag.startMs + MIN_SEGMENT_MS, drag.max);
        next[drag.index] = { ...next[drag.index], startMs: drag.startMs, endMs: end };
      }
      change(next);
    }
  };

  const handlePointerUp = () => {
    const drag = dragging.current;
    dragging.current = null;
    window.removeEventListener('pointermove', handlePointerMove);
    window.removeEventListener('pointerup', handlePointerUp);
    if (!drag) {
      setDraft(null);
      return;
    }

    if (drag.kind === 'create') {
      const current = draftRef.current;
      draftRef.current = null;
      setDraft(null);
      if (current && current.endMs - current.startMs >= MIN_SEGMENT_MS) {
        const list = propsRef.current.segments.slice();
        list.push({ startMs: current.startMs, endMs: current.endMs });
        list.sort((a, b) => a.startMs - b.startMs);
        const index = list.findIndex((s) => s.startMs === current.startMs && s.endMs === current.endMs);
        propsRef.current.onChange(list);
        propsRef.current.onSelect(index >= 0 ? index : null);
      } else {
        const anchor = clamp(snap(drag.anchorMs), drag.gapStart, drag.gapEnd);
        propsRef.current.onSeek(anchor);
      }
      return;
    }

    if (!drag.moved) propsRef.current.onSeek(drag.startMs);
  };

  const draftRef = useRef<Draft>(null);
  draftRef.current = draft;

  useEffect(() => {
    return () => {
      window.removeEventListener('pointermove', handlePointerMove);
      window.removeEventListener('pointerup', handlePointerUp);
    };
  }, []);

  function beginDrag(event: React.PointerEvent, next: Drag) {
    event.preventDefault();
    dragging.current = next;
    window.addEventListener('pointermove', handlePointerMove);
    window.addEventListener('pointerup', handlePointerUp);
  }

  function onTrackPointerDown(event: React.PointerEvent<HTMLDivElement>) {
    if (event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    const ms = timeFromClientX(event.clientX, rect);
    if (propsRef.current.readOnly) {
      propsRef.current.onSeek(ms);
      return;
    }
    const gap = startCreateGap(ms);
    if (!gap) {
      const index = propsRef.current.segments.findIndex((s) => s.startMs <= ms && s.endMs >= ms);
      propsRef.current.onSelect(index >= 0 ? index : null);
      return;
    }
    propsRef.current.onSelect(null);
    setDraft({ startMs: snap(ms), endMs: snap(ms) });
    beginDrag(event, { kind: 'create', anchorMs: ms, gapStart: gap.gapStart, gapEnd: gap.gapEnd, rect });
  }

  function onSegmentPointerDown(event: React.PointerEvent, index: number) {
    if (event.button !== 0) return;
    event.stopPropagation();
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const seg = propsRef.current.segments[index];
    propsRef.current.onSelect(index);
    if (propsRef.current.readOnly) {
      propsRef.current.onSeek(seg.startMs);
      return;
    }
    const prevEnd = index > 0 ? propsRef.current.segments[index - 1].endMs : 0;
    const nextStart =
      index < propsRef.current.segments.length - 1
        ? propsRef.current.segments[index + 1].startMs
        : safeDuration;

    beginDrag(event, {
      kind: 'move',
      index,
      grabMs: timeFromClientX(event.clientX, rect),
      startMs: seg.startMs,
      endMs: seg.endMs,
      minStart: prevEnd,
      maxStart: nextStart - (seg.endMs - seg.startMs),
      moved: false,
      rect,
    });
  }

  function onHandlePointerDown(event: React.PointerEvent, index: number, edge: 'start' | 'end') {
    event.stopPropagation();
    if (event.button !== 0) return;
    const rect = trackRef.current?.getBoundingClientRect();
    if (!rect) return;
    const seg = propsRef.current.segments[index];
    const prevEnd = index > 0 ? propsRef.current.segments[index - 1].endMs : 0;
    const nextStart =
      index < propsRef.current.segments.length - 1
        ? propsRef.current.segments[index + 1].startMs
        : safeDuration;

    beginDrag(event, {
      kind: 'resize',
      edge,
      index,
      startMs: seg.startMs,
      endMs: seg.endMs,
      min: edge === 'start' ? prevEnd : seg.startMs + MIN_SEGMENT_MS,
      max: edge === 'start' ? seg.endMs - MIN_SEGMENT_MS : nextStart,
      moved: false,
      rect,
    });
  }

  const emptyHint = segments.length === 0 && !draft;

  return (
    <div className="timeline-wrap">
      <div className="timeline-ruler">
        {ticks.map((tick) => (
          <span key={tick} className="tick" style={{ left: `${(tick / safeDuration) * 100}%` }}>
            <i />
            <em>{formatClock(tick)}</em>
          </span>
        ))}
      </div>

      <div
        ref={trackRef}
        className={`timeline-track${readOnly ? ' read-only' : ''}`}
        onPointerDown={onTrackPointerDown}
        onPointerMove={(e) => {
          const rect = e.currentTarget.getBoundingClientRect();
          setHoverTime(timeFromClientX(e.clientX, rect));
        }}
        onPointerLeave={() => setHoverTime(null)}
      >
        <div className="track-grid" />
        {emptyHint ? (
          <div className="track-empty">
            <span>在轨道上按住拖动，创建第一个片段</span>
          </div>
        ) : null}

        {segments.map((seg, index) => {
          const selected = selectedIndex === index;
          const width = ((seg.endMs - seg.startMs) / safeDuration) * 100;
          return (
            <div
              key={`${index}-${seg.startMs}-${seg.endMs}`}
              className={`seg${selected ? ' selected' : ''}`}
              style={{ left: percentOf(seg.startMs), width: `${width}%` }}
              onPointerDown={(e) => onSegmentPointerDown(e, index)}
              onDoubleClick={(e) => {
                e.stopPropagation();
                propsRef.current.onSeek(seg.startMs);
              }}
              title={`${formatTime(seg.startMs)} → ${formatTime(seg.endMs)}`}
            >
              {!readOnly ? (
                <span
                  className="seg-handle left"
                  onPointerDown={(e) => onHandlePointerDown(e, index, 'start')}
                />
              ) : null}
              <span className="seg-label">
                {width > 9 ? (
                  <>
                    <strong>{formatTime(seg.startMs - (seg.startMs % 1000), false)}</strong>
                    <em>{((seg.endMs - seg.startMs) / 1000).toFixed(1)}s</em>
                  </>
                ) : null}
              </span>
              {!readOnly ? (
                <span
                  className="seg-handle right"
                  onPointerDown={(e) => onHandlePointerDown(e, index, 'end')}
                />
              ) : null}
            </div>
          );
        })}

        {draft && draft.endMs > draft.startMs ? (
          <div
            className="seg draft"
            style={{ left: percentOf(draft.startMs), width: `${((draft.endMs - draft.startMs) / safeDuration) * 100}%` }}
          >
            <span className="seg-label">
              <strong>{formatTime(draft.startMs - (draft.startMs % 1000), false)}</strong>
              <em>{((draft.endMs - draft.startMs) / 1000).toFixed(1)}s</em>
            </span>
          </div>
        ) : null}

        {hoverTime !== null && !readOnly ? (
          <div className="hover-cursor" style={{ left: percentOf(hoverTime) }} />
        ) : null}

        <div className="playhead" style={{ left: percentOf(currentTimeMs) }}>
          <span />
        </div>
      </div>

      <div className="timeline-foot">
        <span>拖动创建 · 双击片段跳转 · 拖动两侧调整边界</span>
        <span>{segments.length} 个片段 / 共 {formatTime(segments.reduce((sum, s) => sum + (s.endMs - s.startMs), 0))}</span>
      </div>
    </div>
  );
}

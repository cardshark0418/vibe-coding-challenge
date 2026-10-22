import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { TaskStatus } from '../lib/types';
import { IconAlert, IconCheck, IconFilm } from './Icons';

/* ---------------- Toast ---------------- */

type ToastKind = 'success' | 'error' | 'info';
interface ToastItem {
  id: number;
  message: string;
  kind: ToastKind;
}

const ToastContext = createContext<{ show: (message: string, kind?: ToastKind) => void }>({
  show: () => undefined,
});

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<ToastItem[]>([]);
  const timers = useRef<number[]>([]);

  const show = useCallback((message: string, kind: ToastKind = 'info') => {
    const id = Date.now() + Math.random();
    setToasts((prev) => [...prev, { id, message, kind }]);
    const timer = window.setTimeout(() => {
      setToasts((prev) => prev.filter((t) => t.id !== id));
    }, 3600);
    timers.current.push(timer);
  }, []);

  useEffect(() => () => timers.current.forEach((t) => window.clearTimeout(t)), []);

  return (
    <ToastContext.Provider value={useMemo(() => ({ show }), [show])}>
      {children}
      <div className="toast-stack">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast toast-${toast.kind}`}>
            <span className="toast-icon">
              {toast.kind === 'success' ? <IconCheck size={16} /> : null}
              {toast.kind === 'error' ? <IconAlert size={16} /> : null}
              {toast.kind === 'info' ? <IconFilm size={16} /> : null}
            </span>
            {toast.message}
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  );
}

export function useToast() {
  return useContext(ToastContext);
}

/* ---------------- Modal ---------------- */

export function Modal({
  title,
  subtitle,
  onClose,
  children,
  footer,
  width = 520,
}: {
  title: string;
  subtitle?: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  width?: number;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = previous;
    };
  }, [onClose]);

  return createPortal(
    <div className="modal-backdrop" onMouseDown={(e) => e.target === e.currentTarget && onClose()}>
      <div className="modal" style={{ width }} role="dialog" aria-modal="true" aria-label={title}>
        <div className="modal-head">
          <div>
            <h3>{title}</h3>
            {subtitle ? <p>{subtitle}</p> : null}
          </div>
          <button className="icon-btn" onClick={onClose} aria-label="关闭">
            ×
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {footer ? <div className="modal-foot">{footer}</div> : null}
      </div>
    </div>,
    document.body
  );
}

/* ---------------- 小组件 ---------------- */

const STATUS_META: Record<TaskStatus, { label: string; className: string }> = {
  open: { label: '待领取', className: 'badge-info' },
  in_progress: { label: '标注中', className: 'badge-warn' },
  submitted: { label: '已提交', className: 'badge-success' },
};

export function StatusBadge({ status }: { status: TaskStatus }) {
  const meta = STATUS_META[status];
  return <span className={`badge ${meta.className}`}>{meta.label}</span>;
}

export function Spinner({ size = 18 }: { size?: number }) {
  return <span className="spinner" style={{ width: size, height: size }} />;
}

export function EmptyState({
  icon,
  title,
  description,
  action,
}: {
  icon?: ReactNode;
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    <div className="empty">
      <div className="empty-icon">{icon ?? <IconFilm size={22} />}</div>
      <h4>{title}</h4>
      {description ? <p>{description}</p> : null}
      {action}
    </div>
  );
}

export function PageLoader({ label = '加载中…' }: { label?: string }) {
  return (
    <div className="page-loader">
      <Spinner size={22} />
      <span>{label}</span>
    </div>
  );
}

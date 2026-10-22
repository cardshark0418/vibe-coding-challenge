import { NavLink, Outlet, Link, useNavigate } from 'react-router-dom';
import type { ReactNode } from 'react';
import { useAuth } from '../lib/auth';
import { IconChart, IconFilm, IconList, IconLogout, IconUsers } from './Icons';

function Brand() {
  return (
    <Link to="/" className="brand">
      <span className="brand-mark">
        <IconFilm size={18} />
      </span>
      <span className="brand-text">
        <strong>Framewise</strong>
        <small>视频片段标注</small>
      </span>
    </Link>
  );
}

function UserChip() {
  const { user, logout } = useAuth();
  if (!user) return null;
  return (
    <div className="user-chip">
      <span className="avatar">{user.name.slice(0, 1)}</span>
      <span className="user-meta">
        <strong>{user.name}</strong>
        <small>{user.tenant.name}</small>
      </span>
      <button className="icon-btn" onClick={logout} title="退出登录" aria-label="退出登录">
        <IconLogout size={17} />
      </button>
    </div>
  );
}

export function AnnotatorLayout({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  return (
    <div className="app-shell">
      <header className="app-header">
        <div className="header-left">
          <Brand />
          <nav className="header-nav">
            <NavLink to="/tasks" className={({ isActive }) => `nav-link${isActive ? ' active' : ''}`}>
              任务大厅
            </NavLink>
          </nav>
        </div>
        <div className="header-right">
          <span className="tenant-pill">{user?.tenant.name}</span>
          <UserChip />
        </div>
      </header>
      <main className="page">{children}</main>
    </div>
  );
}

export function AdminLayout() {
  const { user } = useAuth();
  const navigate = useNavigate();

  return (
    <div className="admin-shell">
      <aside className="sidebar">
        <Brand />
        <div className="sidebar-section">
          <span className="sidebar-label">管理台</span>
          <NavLink to="/admin" end className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <IconList size={17} /> <span>任务管理</span>
          </NavLink>
          <NavLink to="/admin/stats" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <IconChart size={17} /> <span>工作量统计</span>
          </NavLink>
          <NavLink to="/admin/members" className={({ isActive }) => `side-link${isActive ? ' active' : ''}`}>
            <IconUsers size={17} /> <span>团队成员</span>
          </NavLink>
        </div>
        <div className="sidebar-foot">
          <div className="tenant-card">
            <span className="tenant-card-label">当前租户</span>
            <strong>{user?.tenant.name}</strong>
            <small>数据仅对本租户可见</small>
          </div>
          <button className="side-link ghost" onClick={() => navigate('/tasks')}>
            <IconFilm size={17} /> <span>标注员视图</span>
          </button>
          <UserChip />
        </div>
      </aside>
      <main className="admin-main">
        <Outlet />
      </main>
    </div>
  );
}

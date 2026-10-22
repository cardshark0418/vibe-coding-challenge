import { useState, type FormEvent } from 'react';
import { Navigate, useNavigate } from 'react-router-dom';
import { useAuth } from '../lib/auth';
import { Spinner } from '../components/UI';
import { IconAlert, IconFilm, IconScissors, IconSpark } from '../components/Icons';

const DEMO_ACCOUNTS = [
  { label: '管理员', username: 'admin', password: 'admin123', desc: '星辰数据 · 发布任务 / 看统计' },
  { label: '标注员', username: 'lisi', password: '123456', desc: '星辰数据 · 领取并标注任务' },
  { label: '标注员', username: 'wangwu', password: '123456', desc: '星辰数据 · 领取并标注任务' },
  { label: '管理员', username: 'admin2', password: 'admin123', desc: '蓝海智能 · 验证数据隔离' },
  { label: '标注员', username: 'zhaoliu', password: '123456', desc: '蓝海智能 · 验证数据隔离' },
];

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={user.role === 'admin' ? '/admin' : '/tasks'} replace />;

  async function submit(event: FormEvent) {
    event.preventDefault();
    if (pending) return;
    setError('');
    setPending(true);
    try {
      await login(username.trim(), password);
      navigate(username.trim() === 'admin' || username.trim() === 'admin2' ? '/admin' : '/tasks', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : '登录失败');
    } finally {
      setPending(false);
    }
  }

  const useDemo = (account: (typeof DEMO_ACCOUNTS)[number]) => {
    setUsername(account.username);
    setPassword(account.password);
    setError('');
  };

  return (
    <div className="login-page">
      <section className="login-hero">
        <div className="hero-glow hero-glow-a" />
        <div className="hero-glow hero-glow-b" />

        <div className="hero-brand">
          <span className="brand-mark">
            <IconFilm size={20} />
          </span>
          <span className="brand-text">
            <strong>Framewise</strong>
            <small>视频片段标注平台</small>
          </span>
        </div>

        <div className="hero-copy">
          <span className="hero-eyebrow">
            <IconSpark size={14} /> 机器人示教数据 · 片段标注
          </span>
          <h1>
            把视频里的有效片段
            <br />
            变成<em>可核算</em>的工作量
          </h1>
          <p>在时间轴上拖拽标注，提交即锁定。管理员按天看到真实有效时长，不再手工对表。</p>
        </div>

        <div className="hero-visual" aria-hidden="true">
          <div className="mock-player">
            <div className="mock-screen">
              <span className="mock-play" />
              <span className="mock-time">03:12 / 08:40</span>
            </div>
            <div className="mock-track">
              <span className="mock-seg" style={{ left: '8%', width: '21%' }} />
              <span className="mock-seg" style={{ left: '34%', width: '15%' }} />
              <span className="mock-seg selected" style={{ left: '55%', width: '27%' }}>
                <i className="handle left" />
                <i className="handle right" />
              </span>
              <span className="mock-playhead" style={{ left: '63%' }} />
              <span className="mock-cursor" style={{ left: '79%' }} />
            </div>
          </div>
          <div className="hero-stats">
            <div>
              <small>今日有效时长</small>
              <strong>4.62 h</strong>
            </div>
            <div>
              <small>已提交任务</small>
              <strong>12</strong>
            </div>
            <div>
              <small>标注员</small>
              <strong>3</strong>
            </div>
          </div>
        </div>

        <ul className="hero-points">
          <li>
            <IconScissors size={15} /> 拖拽创建、拉伸、删除片段，区间自动避免重叠
          </li>
          <li>
            <IconFilm size={15} /> 提交后结果锁定，有效时长计入提交当天
          </li>
          <li>
            <IconSpark size={15} /> 租户隔离在后端完成，跨团队数据互不可见
          </li>
        </ul>
      </section>

      <section className="login-panel">
        <form className="auth-card" onSubmit={submit}>
          <header>
            <h2>登录</h2>
            <p>使用团队账号继续</p>
          </header>

          <label className="field">
            <span>账号</span>
            <input
              autoFocus
              autoComplete="username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="例如 admin"
            />
          </label>
          <label className="field">
            <span>密码</span>
            <input
              type="password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="请输入密码"
            />
          </label>

          {error ? (
            <div className="form-error">
              <IconAlert size={15} /> {error}
            </div>
          ) : null}

          <button className="btn btn-primary btn-block" type="submit" disabled={pending || !username || !password}>
            {pending ? <Spinner size={16} /> : null}
            {pending ? '登录中…' : '登录'}
          </button>

          <div className="demo-box">
            <span className="demo-title">演示账号（点击填充）</span>
            {DEMO_ACCOUNTS.map((account) => (
              <button
                key={account.username}
                type="button"
                className="demo-row"
                onClick={() => useDemo(account)}
              >
                <span className="demo-tag">{account.label}</span>
                <span className="demo-main">
                  <strong>
                    {account.username} / {account.password}
                  </strong>
                  <small>{account.desc}</small>
                </span>
                <span className="demo-arrow">→</span>
              </button>
            ))}
          </div>

          <footer className="auth-foot">
            <span>时区 Asia/Shanghai</span>
            <span>租户隔离 · 后端校验</span>
          </footer>
        </form>
      </section>
    </div>
  );
}

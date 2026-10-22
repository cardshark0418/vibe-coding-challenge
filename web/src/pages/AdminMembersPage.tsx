import { useEffect, useState } from 'react';
import { api } from '../lib/api';
import type { Member } from '../lib/types';
import { formatDuration } from '../lib/format';
import { Modal, PageLoader, useToast } from '../components/UI';
import { IconPlus, IconUsers } from '../components/Icons';

export default function AdminMembersPage() {
  const toast = useToast();
  const [members, setMembers] = useState<Member[] | null>(null);
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState({ name: '', username: '', password: '', role: 'annotator' as 'annotator' | 'admin' });

  const load = () => {
    api
      .members()
      .then((res) => setMembers(res.members))
      .catch((err) => {
        toast.show(err instanceof Error ? err.message : '加载成员失败', 'error');
        setMembers([]);
      });
  };

  useEffect(load, []);

  async function create() {
    setSaving(true);
    try {
      await api.createMember({
        name: form.name.trim(),
        username: form.username.trim(),
        password: form.password,
        role: form.role,
      });
      toast.show('成员已添加', 'success');
      setOpen(false);
      setForm({ name: '', username: '', password: '', role: 'annotator' });
      load();
    } catch (err) {
      toast.show(err instanceof Error ? err.message : '添加失败', 'error');
    } finally {
      setSaving(false);
    }
  }

  return (
    <>
      <header className="admin-head">
        <div>
          <p className="eyebrow">团队成员</p>
          <h1>标注团队</h1>
          <p className="page-sub">成员仅能访问所属租户的数据，权限在后端统一校验。</p>
        </div>
        <button className="btn btn-primary" onClick={() => setOpen(true)}>
          <IconPlus size={16} /> 添加成员
        </button>
      </header>

      <div className="table-card">
        {members === null ? (
          <PageLoader label="正在加载成员…" />
        ) : (
          <table className="data-table">
            <thead>
              <tr>
                <th>成员</th>
                <th>角色</th>
                <th className="num">已提交任务</th>
                <th className="num">累计有效时长</th>
                <th>状态</th>
              </tr>
            </thead>
            <tbody>
              {members.map((member) => (
                <tr key={member.id}>
                  <td>
                    <div className="member-cell">
                      <span className="avatar">{member.name.slice(0, 1)}</span>
                      <div className="cell-title">
                        <strong>{member.name}</strong>
                        <span>{member.username}</span>
                      </div>
                    </div>
                  </td>
                  <td>
                    <span className={`badge ${member.role === 'admin' ? 'badge-info' : 'badge-neutral'}`}>
                      {member.role === 'admin' ? '管理员' : '标注员'}
                    </span>
                  </td>
                  <td className="num">{member.submittedTasks}</td>
                  <td className="num">{member.submittedMs > 0 ? formatDuration(member.submittedMs) : '—'}</td>
                  <td>
                    <span className="online">
                      <i /> 正常
                    </span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>

      <div className="member-note">
        <IconUsers size={16} />
        标注员看不到其他租户的任务与统计；管理员账号只能在自己租户内发布任务和查看报表。
      </div>

      {open ? (
        <Modal
          title="添加成员"
          subtitle="新成员会自动归入当前租户。"
          onClose={() => setOpen(false)}
          footer={
            <>
              <button className="btn btn-ghost" onClick={() => setOpen(false)} disabled={saving}>
                取消
              </button>
              <button className="btn btn-primary" onClick={create} disabled={saving}>
                {saving ? '添加中…' : '添加成员'}
              </button>
            </>
          }
        >
          <div className="form-row">
            <label className="field">
              <span>姓名</span>
              <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="例如 李思" />
            </label>
            <label className="field">
              <span>角色</span>
              <select value={form.role} onChange={(e) => setForm({ ...form, role: e.target.value as 'admin' | 'annotator' })}>
                <option value="annotator">标注员</option>
                <option value="admin">管理员</option>
              </select>
            </label>
          </div>
          <label className="field">
            <span>登录账号</span>
            <input
              value={form.username}
              onChange={(e) => setForm({ ...form, username: e.target.value })}
              placeholder="3-32 位字母、数字或 _ . -"
            />
          </label>
          <label className="field">
            <span>初始密码</span>
            <input
              type="password"
              value={form.password}
              onChange={(e) => setForm({ ...form, password: e.target.value })}
              placeholder="至少 6 位"
            />
          </label>
        </Modal>
      ) : null}
    </>
  );
}

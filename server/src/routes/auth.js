import { Router } from 'express';
import bcrypt from 'bcryptjs';
import { db, toUserPayload } from '../db.js';
import { signToken, authenticate } from '../auth.js';

export const authRouter = Router();

authRouter.post('/login', (req, res) => {
  const username = String(req.body?.username || '').trim();
  const password = String(req.body?.password || '');
  if (!username || !password) return res.status(400).json({ error: '请输入账号和密码' });

  const row = db
    .prepare(
      `SELECT u.*, t.name AS tenant_name, t.slug AS tenant_slug
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.username = ?`
    )
    .get(username);

  if (!row || !bcrypt.compareSync(password, row.password_hash)) {
    return res.status(401).json({ error: '账号或密码错误' });
  }

  res.json({ token: signToken(row), user: toUserPayload(row) });
});

authRouter.get('/me', authenticate, (req, res) => {
  res.json({ user: req.user });
});

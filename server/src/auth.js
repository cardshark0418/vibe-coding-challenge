import jwt from 'jsonwebtoken';
import { db, toUserPayload } from './db.js';

const SECRET = process.env.JWT_SECRET || 'video-annotation-platform-dev-secret';
const TOKEN_TTL = '7d';

export function signToken(user) {
  return jwt.sign({ sub: user.id, role: user.role, tenantId: user.tenant_id }, SECRET, {
    expiresIn: TOKEN_TTL,
  });
}

function loadUser(id) {
  return db
    .prepare(
      `SELECT u.*, t.name AS tenant_name, t.slug AS tenant_slug
       FROM users u JOIN tenants t ON t.id = u.tenant_id
       WHERE u.id = ?`
    )
    .get(id);
}

export function authenticate(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7).trim() : '';
  if (!token) return res.status(401).json({ error: '未登录' });

  try {
    const payload = jwt.verify(token, SECRET);
    const row = loadUser(Number(payload.sub));
    if (!row) return res.status(401).json({ error: '账号不存在' });
    req.user = toUserPayload(row);
    req.userRow = row;
    next();
  } catch {
    return res.status(401).json({ error: '登录状态已失效，请重新登录' });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (req.user?.role !== role) return res.status(403).json({ error: '没有访问权限' });
    next();
  };
}

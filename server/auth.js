import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { query } from './db.js';
import { createId } from './id.js';

const JWT_SECRET = process.env.JWT_SECRET || 'my-health-dev-secret';

export { createId };

export async function hashPassword(password) {
  return bcrypt.hash(password, 10);
}

export async function verifyPassword(password, passwordHash) {
  return bcrypt.compare(password, passwordHash);
}

export function issueToken(user) {
  return jwt.sign(
    {
      sub: user.id,
      role: user.role,
      status: user.status,
    },
    JWT_SECRET,
    { expiresIn: '7d' }
  );
}

function getBearerToken(req) {
  const header = req.headers.authorization;
  if (!header?.startsWith('Bearer ')) return null;
  return header.slice('Bearer '.length);
}

export async function loadAuthContext(userId) {
  const { rows } = await query(
    `
      SELECT
        u.id,
        u.email,
        u.role,
        u.status,
        u.is_demo,
        dp.full_name,
        dp.phone,
        dp.pmc_number,
        dp.specialization,
        dp.qualifications,
        w.id AS workspace_id,
        w.name AS workspace_name,
        w.city AS workspace_city,
        w.status AS workspace_status
      FROM users u
      LEFT JOIN doctor_profiles dp ON dp.user_id = u.id
      LEFT JOIN workspaces w ON w.owner_user_id = u.id
      WHERE u.id = $1
      LIMIT 1
    `,
    [userId]
  );

  if (rows.length === 0) return null;
  const row = rows[0];

  return {
    user: {
      id: row.id,
      email: row.email,
      role: row.role,
      status: row.status,
      isDemo: row.is_demo,
    },
    doctor: row.role === 'doctor_owner'
      ? {
          id: row.id,
          name: row.full_name ?? '',
          email: row.email,
          phone: row.phone ?? '',
          pmcNumber: row.pmc_number ?? '',
          specialization: row.specialization ?? '',
          qualifications: row.qualifications ?? '',
        }
      : null,
    workspace: row.workspace_id
      ? {
          id: row.workspace_id,
          name: row.workspace_name,
          city: row.workspace_city,
          status: row.workspace_status,
        }
      : null,
  };
}

export async function requireAuth(req, res, next) {
  try {
    const token = getBearerToken(req);
    if (!token) {
      return res.status(401).json({ error: 'Authentication required', code: 'AUTH_REQUIRED' });
    }

    const payload = jwt.verify(token, JWT_SECRET);
    const authContext = await loadAuthContext(payload.sub);

    if (!authContext) {
      return res.status(401).json({ error: 'Invalid session', code: 'INVALID_SESSION' });
    }

    req.auth = authContext;
    next();
  } catch {
    return res.status(401).json({ error: 'Invalid session', code: 'INVALID_SESSION' });
  }
}

export function requireRole(role) {
  return (req, res, next) => {
    if (!req.auth || req.auth.user.role !== role) {
      return res.status(403).json({ error: 'Forbidden', code: 'FORBIDDEN' });
    }

    next();
  };
}

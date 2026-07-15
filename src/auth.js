const jwt = require('jsonwebtoken');
const { query } = require('./database');
const { createHttpError } = require('./httpError');

const SESSION_COOKIE_NAME = process.env.SESSION_COOKIE_NAME || 'aurora_admin_session';
const SESSION_TTL_MS = Number(process.env.SESSION_TTL_MS || 8 * 60 * 60 * 1000);
const allowedSameSiteValues = new Set(['lax', 'strict', 'none']);

const getSessionSecret = () => {
  if (!process.env.SESSION_SECRET) {
    throw createHttpError(500, 'SESSION_SECRET is required');
  }

  return process.env.SESSION_SECRET;
};

const getSessionCookieSameSite = () => {
  const configured = String(process.env.SESSION_COOKIE_SAME_SITE || '').trim().toLowerCase();
  if (allowedSameSiteValues.has(configured)) return configured;

  return process.env.NODE_ENV === 'production' ? 'none' : 'lax';
};

const getCookieOptions = () => {
  const sameSite = getSessionCookieSameSite();

  return {
    httpOnly: true,
    secure: process.env.NODE_ENV === 'production' || sameSite === 'none',
    sameSite,
    path: '/',
    maxAge: SESSION_TTL_MS
  };
};

const getClearCookieOptions = () => {
  const { maxAge, ...options } = getCookieOptions();
  return options;
};

const parseCookies = (cookieHeader = '') => cookieHeader
  .split(';')
  .map(cookie => cookie.trim())
  .filter(Boolean)
  .reduce((cookies, cookie) => {
    const separatorIndex = cookie.indexOf('=');
    if (separatorIndex === -1) return cookies;

    const name = cookie.slice(0, separatorIndex);
    const value = cookie.slice(separatorIndex + 1);
    try {
      cookies[name] = decodeURIComponent(value);
    } catch {
      cookies[name] = value;
    }
    return cookies;
  }, {});

const toPublicAdmin = (admin) => ({
  id: String(admin.id),
  name: admin.name,
  email: admin.email,
  role: admin.role
});

const signAdminSession = (admin) => jwt.sign({
  sub: String(admin.id),
  email: admin.email,
  role: admin.role
}, getSessionSecret(), { expiresIn: Math.floor(SESSION_TTL_MS / 1000) });

const setAdminSessionCookie = (res, admin) => {
  const token = signAdminSession(admin);
  res.cookie(SESSION_COOKIE_NAME, token, getCookieOptions());
};

const clearAdminSessionCookie = (res) => {
  res.clearCookie(SESSION_COOKIE_NAME, getClearCookieOptions());
};

const getSessionToken = (req) => {
  const cookies = parseCookies(req.headers.cookie || '');
  return cookies[SESSION_COOKIE_NAME] || null;
};

const getAuthenticatedAdmin = async (req) => {
  const token = getSessionToken(req);

  if (!token) {
    throw createHttpError(401, 'Autenticacion requerida');
  }

  const payload = jwt.verify(token, getSessionSecret());
  const result = await query(
    'SELECT id, name, email, role, is_active FROM admins WHERE id = $1 LIMIT 1',
    [payload.sub]
  );
  const admin = result.rows[0];

  if (!admin || !admin.is_active) {
    throw createHttpError(401, 'Sesion invalida');
  }

  return toPublicAdmin(admin);
};

const requireAdmin = async (req, res, next) => {
  try {
    req.admin = await getAuthenticatedAdmin(req);
    next();
  } catch (error) {
    if (error.name === 'JsonWebTokenError' || error.name === 'TokenExpiredError') {
      next(createHttpError(401, 'Sesion invalida'));
      return;
    }

    next(error);
  }
};

module.exports = {
  SESSION_COOKIE_NAME,
  SESSION_TTL_MS,
  clearAdminSessionCookie,
  getAuthenticatedAdmin,
  requireAdmin,
  setAdminSessionCookie,
  toPublicAdmin
};

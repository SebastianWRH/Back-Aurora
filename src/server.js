const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const multer = require('multer');
const {
  listProducts,
  getProductByIdentifier,
  listCategories,
  getSettings,
  getAdminByEmail
} = require('./catalogRepository');
const {
  createProduct,
  updateProduct,
  deleteProduct,
  addProductImages,
  deleteProductImage,
  createCategory,
  updateCategory,
  deleteCategory,
  updateCatalogSettings
} = require('./catalogService');
const {
  clearAdminSessionCookie,
  getAuthenticatedAdmin,
  requireAdmin,
  setAdminSessionCookie,
  toPublicAdmin
} = require('./auth');
const { maybeProductImages, maybeCategoryImage } = require('./uploadMiddleware');
const { HttpError, createHttpError } = require('./httpError');

const loginAttempts = new Map();
const loginWindowMs = Number(process.env.LOGIN_RATE_LIMIT_WINDOW_MS || 15 * 60 * 1000);
const loginMaxAttempts = Number(process.env.LOGIN_RATE_LIMIT_MAX || 5);
const invalidCredentialsMessage = 'Credenciales invalidas';
const dummyPasswordHash = '$2b$12$CwTycUXWue0Thq9StjUM0uJ8ZQawwpTWORdndOwBYy9R75z3zQ8pG';

const asyncHandler = (handler) => (req, res, next) => {
  Promise.resolve(handler(req, res, next)).catch(next);
};

const normalizeOrigin = (origin) => {
  try {
    return new URL(origin).origin;
  } catch {
    return origin.replace(/\/+$/, '');
  }
};

const getAllowedOrigins = () => {
  const configured = (process.env.FRONTEND_URL || '')
    .split(',')
    .map(origin => normalizeOrigin(origin.trim()))
    .filter(Boolean);

  if (process.env.NODE_ENV !== 'production') {
    configured.push('http://localhost:5173', 'http://127.0.0.1:5173');
  }

  return [...new Set(configured)];
};

const createCorsOptions = () => {
  const allowedOrigins = getAllowedOrigins();

  return {
    origin(origin, callback) {
      if (!origin || allowedOrigins.includes(origin)) {
        callback(null, true);
        return;
      }

      callback(createHttpError(403, 'Origen no permitido por CORS'));
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization']
  };
};

const isTrustedOrigin = (origin) => getAllowedOrigins().includes(origin);

const requireTrustedAdminOrigin = (req, res, next) => {
  const safeMethods = new Set(['GET', 'HEAD', 'OPTIONS']);

  if (!req.path.startsWith('/api/admin') || safeMethods.has(req.method)) {
    next();
    return;
  }

  const origin = req.get('origin');

  if (!origin || isTrustedOrigin(origin)) {
    next();
    return;
  }

  next(createHttpError(403, 'Origen no permitido para operaciones administrativas'));
};

const normalizeLoginEmail = (email = '') => String(email).trim().toLowerCase();

const isValidEmail = (email) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);

const getLoginRateLimitKey = (req, email) => `${req.ip || req.socket.remoteAddress || 'unknown'}:${email}`;

const assertLoginRateLimit = (req, email) => {
  const key = getLoginRateLimitKey(req, email);
  const now = Date.now();
  const entry = loginAttempts.get(key);

  if (!entry || entry.resetAt <= now) {
    loginAttempts.set(key, { count: 1, resetAt: now + loginWindowMs });
    return;
  }

  entry.count += 1;

  if (entry.count > loginMaxAttempts) {
    throw createHttpError(429, 'Demasiados intentos. Intenta nuevamente mas tarde');
  }
};

const clearLoginRateLimit = (req, email) => {
  loginAttempts.delete(getLoginRateLimitKey(req, email));
};

const createServer = () => {
  const app = express();

  if (process.env.NODE_ENV === 'production') {
    app.set('trust proxy', 1);
  }

  app.use(cors(createCorsOptions()));
  app.use(express.json({ limit: '1mb' }));
  app.use(requireTrustedAdminOrigin);

  app.get('/', (req, res) => {
    res.json({
      ok: true,
      message: 'Aurora Catalog API',
      endpoints: [
        '/api/products',
        '/api/products/featured',
        '/api/products/:idOrSlug',
        '/api/categories',
        '/api/categories/:idOrSlug/products',
        '/api/settings'
      ]
    });
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/products', asyncHandler(async (req, res) => {
    const products = await listProducts({
      category: req.query.category,
      search: req.query.search,
      featured: req.query.featured,
      stock_status: req.query.stock_status,
      availability: req.query.availability,
      sort: req.query.sort,
      page: req.query.page,
      limit: req.query.limit
    });

    res.json({ products });
  }));

  app.get('/api/products/featured', asyncHandler(async (req, res) => {
    const products = await listProducts({ featured: true, limit: req.query.limit || 12 });
    res.json({ products });
  }));

  app.get('/api/products/:idOrSlug', asyncHandler(async (req, res) => {
    const product = await getProductByIdentifier(req.params.idOrSlug);

    if (!product) {
      throw createHttpError(404, 'Producto no encontrado');
    }

    res.json({ product });
  }));

  app.get('/api/categories', asyncHandler(async (req, res) => {
    res.json({ categories: await listCategories() });
  }));

  app.get('/api/categories/:idOrSlug/products', asyncHandler(async (req, res) => {
    const products = await listProducts({ category: req.params.idOrSlug });
    res.json({ products });
  }));

  app.get('/api/settings', asyncHandler(async (req, res) => {
    const settings = await getSettings();

    if (!settings) {
      throw createHttpError(404, 'Configuracion del catalogo no encontrada');
    }

    res.json({ settings });
  }));

  app.get('/api/catalog-settings', asyncHandler(async (req, res) => {
    const settings = await getSettings();

    if (!settings) {
      throw createHttpError(404, 'Configuracion del catalogo no encontrada');
    }

    res.json({ settings });
  }));

  app.post('/api/admin/auth/login', asyncHandler(async (req, res) => {
    const email = normalizeLoginEmail(req.body?.email);
    const password = req.body?.password;

    if (!email || typeof password !== 'string') {
      throw createHttpError(400, 'Email y contrasena son obligatorios');
    }

    if (!isValidEmail(email)) {
      throw createHttpError(400, 'Email invalido');
    }

    assertLoginRateLimit(req, email);

    const admin = await getAdminByEmail(email);
    const hashToCompare = admin?.password_hash || dummyPasswordHash;
    const validPassword = await bcrypt.compare(password, hashToCompare);

    if (!admin || !admin.is_active || !validPassword) {
      throw createHttpError(401, invalidCredentialsMessage);
    }

    clearLoginRateLimit(req, email);
    setAdminSessionCookie(res, admin);
    res.json({
      admin: toPublicAdmin(admin)
    });
  }));

  app.post('/api/admin/auth/logout', asyncHandler(async (req, res) => {
    clearAdminSessionCookie(res);
    res.status(204).send();
  }));

  app.get('/api/admin/auth/status', asyncHandler(async (req, res) => {
    try {
      const admin = await getAuthenticatedAdmin(req);
      res.json({ admin, authenticated: true });
    } catch (error) {
      if (
        error instanceof HttpError &&
        error.status === 401 ||
        error.name === 'JsonWebTokenError' ||
        error.name === 'TokenExpiredError'
      ) {
        res.json({ admin: null, authenticated: false });
        return;
      }

      throw error;
    }
  }));

  app.get('/api/admin/auth/me', requireAdmin, asyncHandler(async (req, res) => {
    res.json({ admin: req.admin });
  }));

  app.get('/api/admin/products', requireAdmin, asyncHandler(async (req, res) => {
    const products = await listProducts(req.query, { includeInactive: true });
    res.json({ products });
  }));

  app.post('/api/admin/products', requireAdmin, maybeProductImages, asyncHandler(async (req, res) => {
    const product = await createProduct(req.body, req.files || []);
    res.status(201).json({ product });
  }));

  app.put('/api/admin/products/:id', requireAdmin, maybeProductImages, asyncHandler(async (req, res) => {
    const product = await updateProduct(req.params.id, req.body, req.files || []);
    res.json({ product });
  }));

  app.delete('/api/admin/products/:id', requireAdmin, asyncHandler(async (req, res) => {
    await deleteProduct(req.params.id);
    res.status(204).send();
  }));

  app.post('/api/admin/products/:id/images', requireAdmin, maybeProductImages, asyncHandler(async (req, res) => {
    const product = await addProductImages(req.params.id, req.files || []);
    res.status(201).json({ product });
  }));

  app.delete('/api/admin/products/:id/images/:imageId', requireAdmin, asyncHandler(async (req, res) => {
    await deleteProductImage(req.params.id, req.params.imageId);
    res.status(204).send();
  }));

  app.get('/api/admin/categories', requireAdmin, asyncHandler(async (req, res) => {
    const categories = await listCategories({ includeInactive: true });
    res.json({ categories });
  }));

  app.post('/api/admin/categories', requireAdmin, maybeCategoryImage, asyncHandler(async (req, res) => {
    const category = await createCategory(req.body, req.file || null);
    res.status(201).json({ category });
  }));

  app.put('/api/admin/categories/:id', requireAdmin, maybeCategoryImage, asyncHandler(async (req, res) => {
    const category = await updateCategory(req.params.id, req.body, req.file || null);
    res.json({ category });
  }));

  app.delete('/api/admin/categories/:id', requireAdmin, asyncHandler(async (req, res) => {
    await deleteCategory(req.params.id);
    res.status(204).send();
  }));

  app.get('/api/admin/catalog-settings', requireAdmin, asyncHandler(async (req, res) => {
    const settings = await getSettings();
    res.json({ settings });
  }));

  app.put('/api/admin/catalog-settings', requireAdmin, asyncHandler(async (req, res) => {
    const settings = await updateCatalogSettings(req.body);
    res.json({ settings });
  }));

  app.use((req, res) => {
    res.status(404).json({ message: 'Ruta no encontrada' });
  });

  app.use((error, req, res, next) => {
    if (error instanceof multer.MulterError) {
      res.status(400).json({ message: error.message });
      return;
    }

    if (error instanceof HttpError) {
      const payload = { message: error.message };
      if (error.details) payload.details = error.details;
      res.status(error.status).json(payload);
      return;
    }

    if (error.code === '23505') {
      res.status(409).json({ message: 'Registro duplicado' });
      return;
    }

    console.error('Catalog API error:', error.message);
    res.status(500).json({ message: 'Error interno del catalogo' });
  });

  return app;
};

module.exports = { createServer };

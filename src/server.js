const express = require('express');
const cors = require('cors');
const {
  listProducts,
  getProductBySlug,
  listCategories,
  getSettings
} = require('./catalogRepository');

const createServer = () => {
  const app = express();

  app.use(cors());
  app.use(express.json());

  app.get('/', (req, res) => {
    res.json({
      ok: true,
      message: 'Aurora Catalog API',
      endpoints: [
        '/api/products',
        '/api/products/:slug',
        '/api/categories',
        '/api/categories/:slug/products',
        '/api/settings'
      ]
    });
  });

  app.get('/api/health', (req, res) => {
    res.json({ ok: true });
  });

  app.get('/api/products', (req, res) => {
    const products = listProducts({
      category: req.query.category,
      search: req.query.search,
      featured: req.query.featured,
      stock_status: req.query.stock_status
    });

    res.json({ products });
  });

  app.get('/api/products/:slug', (req, res) => {
    const product = getProductBySlug(req.params.slug);

    if (!product) {
      return res.status(404).json({ message: 'Producto no encontrado' });
    }

    return res.json({ product });
  });

  app.get('/api/categories', (req, res) => {
    res.json({ categories: listCategories() });
  });

  app.get('/api/categories/:slug/products', (req, res) => {
    const products = listProducts({ category: req.params.slug });
    res.json({ products });
  });

  app.get('/api/settings', (req, res) => {
    const settings = getSettings();

    if (!settings) {
      return res.status(404).json({ message: 'Configuracion del catalogo no encontrada' });
    }

    return res.json({ settings });
  });

  app.use((req, res) => {
    res.status(404).json({ message: 'Ruta no encontrada' });
  });

  app.use((error, req, res, next) => {
    console.error('Catalog API error:', error);
    res.status(500).json({ message: 'Error interno del catalogo' });
  });

  return app;
};

module.exports = { createServer };

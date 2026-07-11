# Aurora Catalog Backend

API Node.js + Express para un catalogo virtual. Usa SQLite nativo de Node 22 para desarrollo local, sin servicios externos.

## Comandos

```bash
npm install
npm run db:migrate
npm run db:seed
npm run dev
```

La API queda disponible en `http://localhost:3000`.

## Endpoints publicos

- `GET /api/products`
- `GET /api/products?category=collares&search=piedra&featured=true&stock_status=Disponible`
- `GET /api/products/:slug`
- `GET /api/categories`
- `GET /api/categories/:slug/products`
- `GET /api/settings`

## Variables

Configura los valores locales directamente en `.env`:

```bash
PORT=3000
DATABASE_URL=file:./data/catalog.db
WHATSAPP_NUMBER=51942346985
STORE_NAME=Aurora Catalogo
INSTAGRAM_URL=https://www.instagram.com/au.rora_pe/
```

`WHATSAPP_NUMBER` debe ir en formato internacional, sin `+`, espacios ni guiones.

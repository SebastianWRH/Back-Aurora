# Aurora Catalog Backend

API Node.js + Express para el catalogo Aurora. Usa Neon PostgreSQL con `pg`, Cloudinary para imagenes administradas y acceso administrativo mediante cookie `HttpOnly`.

## Arquitectura

- `src/database.js`: pool PostgreSQL, SSL y transacciones.
- `src/server.js`: rutas publicas, auth admin, CORS y errores.
- `src/auth.js`: cookie de sesion firmada con `SESSION_SECRET`.
- `src/catalogRepository.js`: consultas SQL parametrizadas.
- `src/catalogService.js`: escrituras transaccionales, Cloudinary y configuracion.
- `migrations/`: migraciones versionadas.
- `scripts/`: migracion, seed, primer admin y migracion desde SQLite.

## Variables de entorno

```env
DATABASE_URL=
DATABASE_POOL_SIZE=10
DATABASE_SSL=
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
CLOUDINARY_FOLDER=catalogo/productos
MAX_IMAGE_SIZE_BYTES=5242880
MAX_IMAGE_FILES=10
SESSION_SECRET=
SESSION_TTL_MS=28800000
LOGIN_RATE_LIMIT_WINDOW_MS=900000
LOGIN_RATE_LIMIT_MAX=5
ADMIN_NAME=
ADMIN_EMAIL=
ADMIN_INITIAL_PASSWORD=
ADMIN_ROLE=admin
ADMIN_UPDATE_EXISTING=false
FRONTEND_URL=http://localhost:5173
PORT=3000
NODE_ENV=development
WHATSAPP_NUMBER=
STORE_NAME=
INSTAGRAM_URL=
SQLITE_DATABASE_PATH=./data/catalog.db
SOURCE_PUBLIC_DIR=../Front-Aurora/public
```

No expongas `DATABASE_URL`, `SESSION_SECRET`, `ADMIN_INITIAL_PASSWORD`, `CLOUDINARY_API_SECRET` ni contrasenas en frontend, logs o commits.

## Instalacion y ejecucion

```bash
npm install
cp .env.example .env
npm run db:migrate
npm run dev
```

La API queda en `http://localhost:3000`.

## Primer administrador

Define `ADMIN_NAME`, `ADMIN_EMAIL` y `ADMIN_INITIAL_PASSWORD` en el entorno. Luego ejecuta:

```bash
npm run create-admin
```

El script valida el correo, exige minimo 10 caracteres, hashea con bcrypt y no imprime la contrasena.
Si ya existe un administrador con ese correo, el script falla para evitar sobrescrituras accidentales.

## Inicio y cierre de sesion

- Login: `POST /api/admin/auth/login`
- Sesion actual: `GET /api/admin/auth/me`
- Logout: `POST /api/admin/auth/logout`

El login devuelve solo datos publicos del administrador y establece la cookie `aurora_admin_session` con:

- `HttpOnly`
- `Secure` solo en `NODE_ENV=production`
- `SameSite=Lax`
- `Path=/`
- expiracion configurada por `SESSION_TTL_MS`

## Endpoints publicos

- `GET /api/products`
- `GET /api/products/featured`
- `GET /api/products/:idOrSlug`
- `GET /api/categories`
- `GET /api/categories/:idOrSlug/products`
- `GET /api/settings`
- `GET /api/catalog-settings`

## Endpoints administrativos

Todos requieren cookie de sesion valida:

- `GET /api/admin/products`
- `POST /api/admin/products`
- `PUT /api/admin/products/:id`
- `DELETE /api/admin/products/:id`
- `POST /api/admin/products/:id/images`
- `DELETE /api/admin/products/:id/images/:imageId`
- `GET /api/admin/categories`
- `POST /api/admin/categories`
- `PUT /api/admin/categories/:id`
- `DELETE /api/admin/categories/:id`
- `GET /api/admin/catalog-settings`
- `PUT /api/admin/catalog-settings`

Las subidas usan `multipart/form-data`: `images` para productos e `image` para categorias.

## CORS y cookies

Configura `FRONTEND_URL` con el origen exacto del frontend. Puede contener varios origins separados por coma. CORS usa `credentials: true`, por lo que no debe usarse `origin: "*"`.

En produccion:

- configura `NODE_ENV=production`;
- usa HTTPS para que la cookie `Secure` viaje correctamente;
- configura `FRONTEND_URL` con el dominio final del frontend.

## Cambiar contrasena o desactivar admin

Para cambiar la contrasena de un administrador existente, ejecuta `npm run create-admin` con el mismo `ADMIN_EMAIL`, el nuevo `ADMIN_INITIAL_PASSWORD` y `ADMIN_UPDATE_EXISTING=true`. Usa esa variable solo cuando la rotacion sea intencional.

Para desactivar un administrador:

```sql
UPDATE admins SET is_active = false WHERE email = 'admin@dominio.com';
```

## Migracion de datos

```bash
npm run db:migrate-data
```

Lee SQLite desde `SQLITE_DATABASE_PATH`, resuelve assets desde `SOURCE_PUBLIC_DIR`, sube imagenes a Cloudinary y hace upserts en Neon.

## Validacion

Comandos usados para validar:

```bash
npm run check
npm run build
npm test
```

La suite automatizada actual cubre login admin, errores de credenciales, administrador inactivo, `/me`, proteccion de endpoints admin y logout.

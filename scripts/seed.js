require('dotenv').config();

const { db, dbPath } = require('../src/database');

const categories = [
  {
    name: 'Pulseras',
    slug: 'pulseras',
    description: 'Pulseras seleccionadas con dijes, piedras y acabados delicados.',
    image: '/catalogo/pulsera-cuarzo-rosado.png'
  },
  {
    name: 'Aretes',
    slug: 'aretes',
    description: 'Aretes muranos en acabado dorado, disponibles por color.',
    image: '/catalogo/aretes-muranos-multicolor.png'
  },
  {
    name: 'Collares',
    slug: 'collares',
    description: 'Collares delicados para elevar looks especiales con brillo suave.',
    image: '/catalogo/collar-perlas.png'
  }
];

const tags = [
  { name: 'Nuevo', slug: 'nuevo' },
  { name: 'Mas pedido', slug: 'mas-pedido' },
  { name: 'Hecho a mano', slug: 'hecho-a-mano' },
  { name: 'Edicion delicada', slug: 'edicion-delicada' }
];

const catalogImage = (file) => `/catalogo/${file}`;

const products = [
  {
    category: 'collares',
    name: 'Collar de perlas',
    slug: 'collar-de-perlas',
    description: 'Collar de perlas con acabado elegante y broche dorado, pensado para ocasiones especiales y looks delicados.',
    price: 35,
    material: 'Perlas sinteticas y broche dorado',
    color: 'Blanco perla',
    size: 'Ajustable',
    stock_status: 'Disponible',
    is_featured: 1,
    images: [catalogImage('collar-perlas.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'edicion-delicada']
  },
  {
    category: 'aretes',
    name: 'Aretes muranos',
    slug: 'aretes-muranos',
    description: 'Aretes tipo argolla con cuentas murano y acabado dorado. Un mismo diseno disponible en varios colores.',
    price: 25,
    material: 'Murano y acero dorado',
    color: 'Multicolor',
    size: 'Argolla pequena',
    stock_status: 'Disponible',
    is_featured: 1,
    images: [
      catalogImage('aretes-muranos-multicolor.png'),
      catalogImage('aretes-muranos-amarillo.png'),
      catalogImage('aretes-muranos-azul.png'),
      catalogImage('aretes-muranos-morado.png'),
      catalogImage('aretes-muranos-rosado.png'),
      catalogImage('aretes-muranos-verde.png'),
      catalogImage('aretes-muranos-negro.png')
    ],
    variants: [
      { name: 'Color', value: 'Multicolor', price_adjustment: 0, stock_status: 'Disponible' },
      { name: 'Color', value: 'Amarillo', price_adjustment: 0, stock_status: 'Disponible' },
      { name: 'Color', value: 'Azul', price_adjustment: 0, stock_status: 'Disponible' },
      { name: 'Color', value: 'Morado', price_adjustment: 0, stock_status: 'Disponible' },
      { name: 'Color', value: 'Rosado', price_adjustment: 0, stock_status: 'Disponible' },
      { name: 'Color', value: 'Verde', price_adjustment: 0, stock_status: 'Disponible' },
      { name: 'Color', value: 'Negro', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'hecho-a-mano']
  },
  {
    category: 'pulseras',
    name: 'Pulsera azul con corazon negro',
    slug: 'pulsera-azul-corazon-negro',
    description: 'Pulsera ajustable en tonos azules con dije de corazon oscuro.',
    price: 25,
    material: 'Cuentas y dije',
    color: 'Azul y negro',
    size: 'Ajustable',
    stock_status: 'Disponible',
    is_featured: 0,
    images: [catalogImage('pulsera-azul-corazon-negro.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'hecho-a-mano']
  },
  {
    category: 'pulseras',
    name: 'Pulsera ojo de tigre con corazon',
    slug: 'pulsera-ojo-tigre-corazon',
    description: 'Pulsera de tonos marrones con dije central de corazon oscuro.',
    price: 25,
    material: 'Piedras tipo ojo de tigre y dije',
    color: 'Marron',
    size: 'Ajustable',
    stock_status: 'Disponible',
    is_featured: 0,
    images: [catalogImage('pulsera-ojo-tigre-corazon.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'hecho-a-mano']
  },
  {
    category: 'pulseras',
    name: 'Pulsera azul con dije circular',
    slug: 'pulsera-azul-dije-circular',
    description: 'Pulsera ajustable en tonos azules con dije circular central.',
    price: 25,
    material: 'Cuentas azules y dije',
    color: 'Azul',
    size: 'Ajustable',
    stock_status: 'Disponible',
    is_featured: 1,
    images: [catalogImage('pulsera-azul-dije-circular.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'hecho-a-mano']
  },
  {
    category: 'pulseras',
    name: 'Pulsera azul intensa',
    slug: 'pulsera-azul-intensa',
    description: 'Pulsera elastica de cuentas azules intensas para combinar a diario.',
    price: 25,
    material: 'Cuentas de piedra sintetica',
    color: 'Azul intenso',
    size: 'Elastica',
    stock_status: 'Disponible',
    is_featured: 0,
    images: [catalogImage('pulsera-azul-intensa.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'hecho-a-mano']
  },
  {
    category: 'pulseras',
    name: 'Pulsera lapis con corazon azul',
    slug: 'pulsera-lapis-corazon-azul',
    description: 'Pulsera de cuentas azules con dije de corazon jaspeado.',
    price: 25,
    material: 'Cuentas azules y dije',
    color: 'Azul',
    size: 'Elastica',
    stock_status: 'Disponible',
    is_featured: 0,
    images: [catalogImage('pulsera-lapis-corazon-azul.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'hecho-a-mano']
  },
  {
    category: 'pulseras',
    name: 'Pulsera beige con corazon marron',
    slug: 'pulsera-beige-corazon-marron',
    description: 'Pulsera clara con dije de corazon en tono marron suave.',
    price: 25,
    material: 'Perlas sinteticas y dije',
    color: 'Beige y marron',
    size: 'Ajustable',
    stock_status: 'Disponible',
    is_featured: 0,
    images: [catalogImage('pulsera-beige-corazon-marron.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'hecho-a-mano']
  },
  {
    category: 'pulseras',
    name: 'Pulsera roja con corazon gris',
    slug: 'pulsera-roja-corazon-gris',
    description: 'Pulsera roja de doble vuelta con dije de corazon gris.',
    price: 25,
    material: 'Cristales y dije',
    color: 'Rojo y gris',
    size: 'Ajustable',
    stock_status: 'Disponible',
    is_featured: 0,
    images: [catalogImage('pulsera-gris-corazon.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'hecho-a-mano']
  },
  {
    category: 'pulseras',
    name: 'Pulsera cuarzo rosado',
    slug: 'pulsera-cuarzo-rosado',
    description: 'Pulsera rosada con dije de cuarzo para un acabado delicado.',
    price: 25,
    material: 'Cuarzo rosado y cristales',
    color: 'Rosa',
    size: 'Ajustable',
    stock_status: 'Disponible',
    is_featured: 1,
    images: [catalogImage('pulsera-cuarzo-rosado.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'edicion-delicada']
  },
  {
    category: 'pulseras',
    name: 'Pulsera roja con corazon rosa',
    slug: 'pulsera-roja-corazon-rosa',
    description: 'Pulsera roja con dije de corazon rosa y cierre ajustable.',
    price: 25,
    material: 'Cristales y dije',
    color: 'Rojo y rosa',
    size: 'Ajustable',
    stock_status: 'Disponible',
    is_featured: 0,
    images: [catalogImage('pulsera-roja-corazon-rosa.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'hecho-a-mano']
  },
  {
    category: 'pulseras',
    name: 'Pulsera jaspe marron',
    slug: 'pulsera-jaspe-marron',
    description: 'Pulsera de tonos tierra con dije ovalado central.',
    price: 25,
    material: 'Piedra tipo jaspe y dije',
    color: 'Marron',
    size: 'Ajustable',
    stock_status: 'Disponible',
    is_featured: 0,
    images: [catalogImage('pulsera-jaspe-marron.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'hecho-a-mano']
  },
  {
    category: 'pulseras',
    name: 'Pulsera verde natural',
    slug: 'pulsera-verde-natural',
    description: 'Pulsera elastica de cuentas verdes con brillo natural.',
    price: 25,
    material: 'Cuentas verdes',
    color: 'Verde',
    size: 'Elastica',
    stock_status: 'Disponible',
    is_featured: 0,
    images: [catalogImage('pulsera-verde-natural.png')],
    variants: [
      { name: 'Modelo', value: 'Unico', price_adjustment: 0, stock_status: 'Disponible' }
    ],
    tags: ['nuevo', 'hecho-a-mano']
  }
];

const resetTablesSql = `
  DELETE FROM product_tag_relations;
  DELETE FROM product_variants;
  DELETE FROM product_images;
  DELETE FROM products;
  DELETE FROM product_tags;
  DELETE FROM categories;
  DELETE FROM catalog_settings;
`;

const insertCategory = db.prepare(`
  INSERT INTO categories (name, slug, description, image, is_active)
  VALUES (?, ?, ?, ?, 1)
`);

const insertTag = db.prepare(`
  INSERT INTO product_tags (name, slug)
  VALUES (?, ?)
`);

const insertProduct = db.prepare(`
  INSERT INTO products (
    category_id, name, slug, description, price, material, color, size,
    stock_status, is_featured, is_active
  )
  VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)
`);

const insertImage = db.prepare(`
  INSERT INTO product_images (product_id, image_url, alt_text, sort_order)
  VALUES (?, ?, ?, ?)
`);

const insertVariant = db.prepare(`
  INSERT INTO product_variants (product_id, name, value, price_adjustment, stock_status)
  VALUES (?, ?, ?, ?, ?)
`);

const insertRelation = db.prepare(`
  INSERT INTO product_tag_relations (product_id, tag_id)
  VALUES (?, ?)
`);

const insertSettings = db.prepare(`
  INSERT INTO catalog_settings (
    id, store_name, whatsapp_number, instagram_url, default_whatsapp_message, currency
  )
  VALUES (1, ?, ?, ?, ?, ?)
`);

const categoryBySlug = db.prepare('SELECT id FROM categories WHERE slug = ?');
const tagBySlug = db.prepare('SELECT id FROM product_tags WHERE slug = ?');

db.exec('BEGIN');

try {
  db.exec(resetTablesSql);

  for (const category of categories) {
    insertCategory.run(category.name, category.slug, category.description, category.image);
  }

  for (const tag of tags) {
    insertTag.run(tag.name, tag.slug);
  }

  for (const product of products) {
    const category = categoryBySlug.get(product.category);
    const result = insertProduct.run(
      category.id,
      product.name,
      product.slug,
      product.description,
      product.price,
      product.material,
      product.color,
      product.size,
      product.stock_status,
      product.is_featured
    );

    const productId = result.lastInsertRowid;

    product.images.forEach((image, index) => {
      insertImage.run(productId, image, product.name, index);
    });

    product.variants.forEach(variant => {
      insertVariant.run(
        productId,
        variant.name,
        variant.value,
        variant.price_adjustment,
        variant.stock_status
      );
    });

    product.tags.forEach(tagSlug => {
      const tag = tagBySlug.get(tagSlug);
      insertRelation.run(productId, tag.id);
    });
  }

  insertSettings.run(
    process.env.STORE_NAME || 'Aurora Catalogo',
    process.env.WHATSAPP_NUMBER || '51942346985',
    process.env.INSTAGRAM_URL || 'https://www.instagram.com/au.rora_pe/',
    'Hola, me interesa consultar disponibilidad y coordinar una compra.',
    'S/'
  );

  db.exec('COMMIT');
  console.log(`Seed loaded into ${dbPath}`);
} catch (error) {
  db.exec('ROLLBACK');
  throw error;
}

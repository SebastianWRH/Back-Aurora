const { v2: cloudinary } = require('cloudinary');
const { createHttpError } = require('./httpError');

const allowedImageTypes = {
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/webp': 'webp',
  'image/gif': 'gif'
};

const maxImageSize = Number(process.env.MAX_IMAGE_SIZE_BYTES || 5 * 1024 * 1024);

const getProductsFolder = () => process.env.CLOUDINARY_FOLDER || 'catalogo/productos';

const getCategoriesFolder = () => {
  const productsFolder = getProductsFolder();
  return productsFolder.endsWith('/productos')
    ? productsFolder.replace(/\/productos$/, '/categorias')
    : `${productsFolder}/categorias`;
};

const getFolder = (type = 'products') => {
  if (type === 'categories') return getCategoriesFolder();
  return getProductsFolder();
};

const configureCloudinary = () => {
  const { CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY, CLOUDINARY_API_SECRET } = process.env;

  if (!CLOUDINARY_CLOUD_NAME || !CLOUDINARY_API_KEY || !CLOUDINARY_API_SECRET) {
    throw createHttpError(500, 'Cloudinary is not configured');
  }

  cloudinary.config({
    cloud_name: CLOUDINARY_CLOUD_NAME,
    api_key: CLOUDINARY_API_KEY,
    api_secret: CLOUDINARY_API_SECRET,
    secure: true
  });
};

const detectImageType = (buffer) => {
  if (!Buffer.isBuffer(buffer) || buffer.length < 12) return null;

  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) {
    return { mime: 'image/jpeg', format: 'jpg' };
  }

  if (
    buffer[0] === 0x89 &&
    buffer[1] === 0x50 &&
    buffer[2] === 0x4e &&
    buffer[3] === 0x47 &&
    buffer[4] === 0x0d &&
    buffer[5] === 0x0a &&
    buffer[6] === 0x1a &&
    buffer[7] === 0x0a
  ) {
    return { mime: 'image/png', format: 'png' };
  }

  if (buffer.subarray(0, 4).toString('ascii') === 'RIFF' && buffer.subarray(8, 12).toString('ascii') === 'WEBP') {
    return { mime: 'image/webp', format: 'webp' };
  }

  const gifHeader = buffer.subarray(0, 6).toString('ascii');
  if (gifHeader === 'GIF87a' || gifHeader === 'GIF89a') {
    return { mime: 'image/gif', format: 'gif' };
  }

  return null;
};

const validateImageFile = (file) => {
  if (!file?.buffer) {
    throw createHttpError(400, 'Imagen invalida');
  }

  if (file.size > maxImageSize) {
    throw createHttpError(400, `La imagen supera el limite de ${Math.round(maxImageSize / 1024 / 1024)} MB`);
  }

  const detected = detectImageType(file.buffer);

  if (!detected || !allowedImageTypes[detected.mime]) {
    throw createHttpError(400, 'Formato de imagen no permitido');
  }

  if (file.mimetype && file.mimetype !== detected.mime) {
    throw createHttpError(400, 'El tipo MIME de la imagen no coincide con su contenido');
  }

  return detected;
};

const uploadBuffer = (file, folderType = 'products') => {
  configureCloudinary();
  validateImageFile(file);

  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream({
      folder: getFolder(folderType),
      resource_type: 'image',
      unique_filename: true,
      use_filename: false
    }, (error, result) => {
      if (error) {
        reject(createHttpError(502, 'No se pudo subir la imagen'));
        return;
      }

      resolve({
        secure_url: result.secure_url,
        public_id: result.public_id,
        width: result.width || null,
        height: result.height || null,
        format: result.format || null
      });
    });

    stream.end(file.buffer);
  });
};

const uploadSource = async (source, folderType = 'products') => {
  configureCloudinary();
  const result = await cloudinary.uploader.upload(source, {
    folder: getFolder(folderType),
    resource_type: 'image',
    unique_filename: true,
    use_filename: false
  });

  return {
    secure_url: result.secure_url,
    public_id: result.public_id,
    width: result.width || null,
    height: result.height || null,
    format: result.format || null
  };
};

const deleteImage = async (publicId) => {
  if (!publicId) return null;
  configureCloudinary();
  return cloudinary.uploader.destroy(publicId, { resource_type: 'image' });
};

const deleteImages = async (publicIds = []) => {
  const uniquePublicIds = [...new Set(publicIds.filter(Boolean))];
  const results = [];

  for (const publicId of uniquePublicIds) {
    try {
      results.push(await deleteImage(publicId));
    } catch (error) {
      results.push({ public_id: publicId, error: error.message });
    }
  }

  return results;
};

module.exports = {
  allowedImageTypes,
  maxImageSize,
  getFolder,
  validateImageFile,
  uploadBuffer,
  uploadSource,
  deleteImage,
  deleteImages
};

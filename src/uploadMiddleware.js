const multer = require('multer');
const { maxImageSize } = require('./cloudinaryService');

const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: maxImageSize,
    files: Number(process.env.MAX_IMAGE_FILES || 25)
  }
});

const maybeProductImages = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  return upload.any()(req, res, next);
};

const maybeCategoryImage = (req, res, next) => {
  if (!req.is('multipart/form-data')) return next();
  return upload.single('image')(req, res, next);
};

module.exports = {
  maybeProductImages,
  maybeCategoryImage
};

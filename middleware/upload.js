// middleware/upload.js
const multer = require('multer');
const multerS3 = require('multer-s3');
const s3Client = require('../config/s3Client');
const path = require('path');

const bucket = process.env.AWS_BUCKET_NAME;

const upload = multer({
  storage: multerS3({
    s3: s3Client,
    bucket: bucket,
    acl: 'public-read', // Or 'private'
    contentType: multerS3.AUTO_CONTENT_TYPE,
    metadata: function (req, file, cb) {
      cb(null, { fieldName: file.fieldname });
    },
    key: function (req, file, cb) {
      const ext = path.extname(file.originalname);
      cb(null, `uploads/${Date.now().toString()}${ext}`);
    }
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter: function (req, file, cb) {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed!'), false);
    }
  }
});

module.exports = upload;

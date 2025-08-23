

{/**const multer = require('multer');
const path = require('path');
const fs = require('fs');

const createUploader = (folderName = 'profile') => {
  const storage = multer.diskStorage({
    destination: (req, file, cb) => {
      const uploadPath = path.join(__dirname, '..', 'uploads', folderName);
      fs.mkdirSync(uploadPath, { recursive: true });
      cb(null, uploadPath);
    },
    filename: (req, file, cb) => {
      const ext = path.extname(file.originalname);
      cb(null, Date.now() + ext);
    },
  });

  const fileFilter = (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed'));
    }
  };

  return multer({
    storage,
    fileFilter,
    limits: {
      fileSize: 1024 * 1024 * 5, // 5MB max
    },
  });
};

module.exports = createUploader;
 */}
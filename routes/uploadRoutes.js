const express = require("express");
const router = express.Router();
const {
  getUploadUrl,
  getPresignedReadUrl,
  deleteImage,
  getPublicUploadUrl,
  deletePublicImage
} = require("../controllers/uploadController");

// Generate pre-signed URL for upload
router.get("/presigned-upload-url", getUploadUrl);

// Get read-only presigned URL for viewing
router.get("/presigned-read-url", getPresignedReadUrl);

// Delete image from S3
router.delete("/delete-image", deleteImage);


router.get("/public-presigned-upload-url", getPublicUploadUrl); // public

router.delete("/public-image", deletePublicImage); 

module.exports = router;

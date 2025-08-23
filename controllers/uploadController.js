// controllers/uploadsController.js
const { s3, deleteImageFromS3 } = require("../utils/s3Client");


const {
  PutObjectCommand,
  GetObjectCommand,
  DeleteObjectCommand,
} = require("@aws-sdk/client-s3");
const { getSignedUrl } = require("@aws-sdk/s3-request-presigner");
const crypto = require("crypto");

const ALLOWED_PREFIXES = new Set(["doctors", "users", "hospitals"]);

const generateKey = (folder, extension = "jpg") => {
  const id = crypto.randomBytes(16).toString("hex");
  return `${folder}/${Date.now()}-${id}.${extension}`;
};

const sanitizeKeyPath = (input) => {
  const base = input.split("?")[0].split("#")[0];
  const parts = base.split("/").filter(Boolean);
  const safeParts = parts.filter((p) => p !== "." && p !== "..");
  return safeParts.join("/");
};

const extractKeyFromUrl = (url) => {
  const raw = (() => {
    try {
      const u = new URL(url);
      return decodeURIComponent(u.pathname.replace(/^\/+/, ""));
    } catch {
      return url.replace(/^\/+/, "");
    }
  })();
  const clean = sanitizeKeyPath(raw);
  const [prefix] = clean.split("/");
  if (!ALLOWED_PREFIXES.has(prefix)) {
    const err = new Error(`Disallowed key prefix: ${prefix || "(empty)"}`);
    err.status = 400;
    throw err;
  }
  return clean;
};

const buildPublicUrl = (bucket, region, key) => {
  const encodedKey = encodeURI(key).replace(/#/g, "%23");
  const host =
    (region || "").trim() === "us-east-1"
      ? `https://${bucket}.s3.amazonaws.com`
      : `https://${bucket}.s3.${region}.amazonaws.com`;
  return `${host}/${encodedKey}`;
};

/* -------------------- PRIVATE BUCKET -------------------- */

exports.getUploadUrl = async (req, res) => {
  try {
    const { folder = "users", contentType = "image/jpeg" } = req.query;
    const ext = (contentType.split("/")[1] || "jpg").toLowerCase();
    if (!ALLOWED_PREFIXES.has(folder)) {
      return res.status(400).json({ message: "Invalid folder" });
    }

    const key = generateKey(folder, ext);
    const cmd = new PutObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: key,
      ContentType: contentType,
    });
    const uploadUrl = await getSignedUrl(s3, cmd, { expiresIn: 300 }); // 5 min

    res.json({ uploadUrl, key });
  } catch (err) {
    console.error("getUploadUrl:", err);
    res.status(500).json({ message: "Could not create upload URL" });
  }
};

exports.getPresignedReadUrl = async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ message: "Missing key" });

    const safeKey = extractKeyFromUrl(key);
    const cmd = new GetObjectCommand({
      Bucket: process.env.S3_BUCKET_NAME,
      Key: safeKey,
    });
    const url = await getSignedUrl(s3, cmd, { expiresIn: 3600 }); // 1 hour

    res.json({ url });
  } catch (err) {
    console.error("getPresignedReadUrl:", err);
    res.status(err.status || 500).json({ message: err.message || "Failed" });
  }
};

exports.deleteImage = async (req, res) => {
  try {
    const { key } = req.query;
    if (!key) return res.status(400).json({ success: false, error: "Missing key" });

    const safeKey = extractKeyFromUrl(key);
    await deleteImageFromS3(safeKey);
    res.json({ success: true, message: "Image deleted" });
  } catch (err) {
    console.error("deleteImage:", err);
    res.status(err.status || 500).json({ success: false, error: err.message || "Failed" });
  }
};

/* -------------------- PUBLIC BUCKET -------------------- */

exports.getPublicUploadUrl = async (req, res) => {
  try {
    const { folder = "hospitals", contentType = "image/jpeg" } = req.query;
    const ext = (contentType.split("/")[1] || "jpg").toLowerCase();
    if (!ALLOWED_PREFIXES.has(folder)) {
      return res.status(400).json({ message: "Invalid folder" });
    }

    const key = generateKey(folder, ext);
    const put = new PutObjectCommand({
      Bucket: process.env.AWS_PUBLIC_BUCKET,
      Key: key,
      ContentType: contentType,
      CacheControl: "public, max-age=31536000, immutable",
    });

    const uploadUrl = await getSignedUrl(s3, put, { expiresIn: 300 }); // 5 min
    const region = process.env.AWS_PUBLIC_REGION || process.env.AWS_REGION || "us-east-1";
    const publicUrl = buildPublicUrl(process.env.AWS_PUBLIC_BUCKET, region, key);
console.log(publicUrl)
    res.json({ uploadUrl, key, publicUrl });
  } catch (err) {
    console.error("getPublicUploadUrl:", err);
    res.status(500).json({ message: "Could not create public upload URL" });
  }
};

exports.deletePublicImage = async (req, res) => {
  try {
    const { key, url } = req.body || {};
    const objectKey = key
      ? extractKeyFromUrl(key)
      : url
      ? extractKeyFromUrl(url)
      : null;

    if (!objectKey) return res.status(400).json({ message: "Missing key or url" });

    await s3.send(
      new DeleteObjectCommand({
        Bucket: process.env.AWS_PUBLIC_BUCKET,
        Key: objectKey,
      })
    );

    res.json({ message: "Public image deleted" });
  } catch (err) {
    console.error("deletePublicImage:", err);
    res.status(err.status || 500).json({ message: err.message || "Failed" });
  }
};

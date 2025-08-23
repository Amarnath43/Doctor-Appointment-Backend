const { S3Client, DeleteObjectCommand } = require("@aws-sdk/client-s3");

const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY,
  }
});

const deleteImageFromS3 = async (key) => {
  const command = new DeleteObjectCommand({
    Bucket: process.env.AWS_PUBLIC_BUCKET,
    Key: key,
  });

  try {
    await s3.send(command);
    console.log(`Deleted: ${key}`);
  } catch (err) {
    console.error("Error deleting from S3:", err);
    throw err;
  }
};

module.exports = { s3, deleteImageFromS3 };

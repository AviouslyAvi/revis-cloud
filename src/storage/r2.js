const { S3Client, PutObjectCommand, GetObjectCommand, DeleteObjectCommand, DeleteObjectsCommand, HeadObjectCommand } = require('@aws-sdk/client-s3');
const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');

const r2 = new S3Client({
  region: 'auto',
  endpoint: `https://${process.env.R2_ACCOUNT_ID}.r2.cloudflarestorage.com`,
  credentials: {
    accessKeyId: process.env.R2_ACCESS_KEY_ID,
    secretAccessKey: process.env.R2_SECRET_ACCESS_KEY,
  },
});

const BUCKET = process.env.R2_BUCKET_NAME || 'revis-audio';

/**
 * Upload a file buffer to R2
 * @param {string} key - Object key (e.g., "user_abc/file123.wav")
 * @param {Buffer} buffer - File data
 * @param {string} contentType - MIME type
 */
async function uploadFile(key, buffer, contentType) {
  await r2.send(new PutObjectCommand({
    Bucket: BUCKET,
    Key: key,
    Body: buffer,
    ContentType: contentType,
  }));
  return key;
}

/**
 * Delete a single file from R2
 */
async function deleteFile(key) {
  try {
    await r2.send(new DeleteObjectCommand({ Bucket: BUCKET, Key: key }));
  } catch (e) {
    console.error('R2 delete error:', key, e.message);
  }
}

/**
 * Delete multiple files from R2
 */
async function deleteFiles(keys) {
  if (!keys.length) return;
  // R2 supports batch delete up to 1000 objects
  const batches = [];
  for (let i = 0; i < keys.length; i += 1000) {
    batches.push(keys.slice(i, i + 1000));
  }
  for (const batch of batches) {
    try {
      await r2.send(new DeleteObjectsCommand({
        Bucket: BUCKET,
        Delete: { Objects: batch.map(Key => ({ Key })) },
      }));
    } catch (e) {
      console.error('R2 batch delete error:', e.message);
    }
  }
}

/**
 * Generate a presigned GET URL for streaming
 * @param {string} key - Object key
 * @param {number} expiresIn - Seconds until expiry (default 1 hour)
 */
async function getPresignedUrl(key, expiresIn = 3600) {
  return getSignedUrl(r2, new GetObjectCommand({
    Bucket: BUCKET,
    Key: key,
  }), { expiresIn });
}

/**
 * Get file as a readable stream (for ZIP assembly)
 */
async function getFileStream(key) {
  const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  return res.Body;
}

/**
 * Get file as a buffer (for ZIP assembly)
 */
async function getFileBuffer(key) {
  const res = await r2.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
  const chunks = [];
  for await (const chunk of res.Body) chunks.push(chunk);
  return Buffer.concat(chunks);
}

/**
 * Check if a file exists in R2
 */
async function fileExists(key) {
  try {
    await r2.send(new HeadObjectCommand({ Bucket: BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

module.exports = { uploadFile, deleteFile, deleteFiles, getPresignedUrl, getFileStream, getFileBuffer, fileExists };

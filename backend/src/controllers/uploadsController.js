// backend/src/controllers/uploadsController.js

const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const sharp = require('sharp');
const crypto = require('crypto');
const { randomUUID } = require('crypto');
const mongoose = require('mongoose');

const Image = require('../models/ImageUpload');
const Product = require('../models/Product');

/* =====================================================================
   STORAGE MODE (LOCKED)
   ---------------------------------------------------------------------
   - Default: local
   - S3 is OPTIONAL and DISABLED unless explicitly enabled via env
   ===================================================================== */
const STORAGE_DRIVER = process.env.STORAGE_DRIVER || 'local';

/* ------------------------- Local upload base ------------------------- */

const UPLOAD_BASE = path.join(process.cwd(), 'uploads', 'images');
const SUBFOLDERS = { thumb: 'thumb', medium: 'medium', original: 'original' };

function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDirSync(UPLOAD_BASE);

/* =====================================================================
   S3 PRESIGN (OPTIONAL – GUARDED)
   ---------------------------------------------------------------------
   This endpoint is INACTIVE unless:
     STORAGE_DRIVER=s3
   ===================================================================== */

const { S3Client } = require('@aws-sdk/client-s3');
const { createPresignedPost } = require('@aws-sdk/s3-presigned-post');

// AWS client is defined but NEVER USED unless STORAGE_DRIVER === 's3'
const s3 = new S3Client({
  region: process.env.AWS_REGION,
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY
  }
});

/**
 * POST /api/uploads/presign
 * Admin-only
 * GUARDED: will refuse unless STORAGE_DRIVER === 's3'
 */
async function presign(req, res, next) {
  if (STORAGE_DRIVER !== 's3') {
    return res.status(400).json({
      success: false,
      message: 'S3 storage is disabled'
    });
  }

  try {
    const { entity, entityId, role, mimeType } = req.body;

    if (!entity || !entityId || !role || !mimeType) {
      return res.status(400).json({
        success: false,
        message: 'Missing required fields (entity, entityId, role, mimeType)'
      });
    }

    if (!mimeType.startsWith('image/')) {
      return res.status(400).json({
        success: false,
        message: 'Only image uploads are allowed'
      });
    }

    const ext = mimeType.split('/')[1] || 'jpg';
    const filename = `${Date.now()}-${crypto.randomBytes(6).toString('hex')}.${ext}`;
    const key = `${entity}s/${entityId}/${role}/${filename}`;

    const presigned = await createPresignedPost(s3, {
      Bucket: process.env.AWS_S3_BUCKET,
      Key: key,
      Fields: { 'Content-Type': mimeType },
      Conditions: [
        ['starts-with', '$Content-Type', 'image/'],
        ['content-length-range', 1, 12 * 1024 * 1024]
      ],
      Expires: 300
    });

    return res.json({
      url: presigned.url,
      fields: presigned.fields,
      key,
      expiresIn: 300
    });
  } catch (err) {
    next(err);
  }
}

/* =====================================================================
   LOCAL IMAGE UPLOAD (PRODUCTION PATH)
   ===================================================================== */

function extFromName(name) {
  return path.extname(name || '').toLowerCase() || '.jpg';
}

async function writeSharpVariants(buffer, destDir, baseName, ext) {
  const thumbName = `${baseName}-thumb${ext}`;
  const mediumName = `${baseName}-medium${ext}`;
  const origName = `${baseName}-orig${ext}`;

  await Promise.all(
    Object.values(SUBFOLDERS).map(d =>
      fsp.mkdir(path.join(destDir, d), { recursive: true })
    )
  );

  await Promise.all([
    sharp(buffer).resize({ width: 300, withoutEnlargement: true })
      .toFile(path.join(destDir, SUBFOLDERS.thumb, thumbName)),
    sharp(buffer).resize({ width: 1024, withoutEnlargement: true })
      .toFile(path.join(destDir, SUBFOLDERS.medium, mediumName)),
    sharp(buffer).toFile(
      path.join(destDir, SUBFOLDERS.original, origName)
    )
  ]);

  return { thumbName, mediumName, origName };
}

/**
 * POST /api/uploads/admin/upload
 * LOCAL STORAGE ONLY
 */
async function uploadImage(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only images allowed' });
    }

    await sharp(req.file.buffer).metadata(); // validate image

    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const destDir = path.join(UPLOAD_BASE, String(YYYY), MM);
    ensureDirSync(destDir);

    const baseName = randomUUID();
    const ext = extFromName(req.file.originalname);

    const names = await writeSharpVariants(
      req.file.buffer,
      destDir,
      baseName,
      ext
    );

    const filenames = {
      thumb: `images/${YYYY}/${MM}/thumb/${names.thumbName}`,
      medium: `images/${YYYY}/${MM}/medium/${names.mediumName}`,
      original: `images/${YYYY}/${MM}/original/${names.origName}`
    };

    const urls = {
      thumb: `/uploads/${filenames.thumb}`,
      medium: `/uploads/${filenames.medium}`,
      original: `/uploads/${filenames.original}`
    };

    const imageDoc = await Image.create({
      title: req.body.title || '',
      description: req.body.description || '',
      filenames,
      urls,
      contentType: req.file.mimetype,
      size: req.file.size,
      uploadedBy: req.user?.id || null,
      productId: req.body.productId || null,
      role: req.body.role || null,
      order: Number(req.body.order) || 0,
      version: 1
    });

    if (imageDoc.productId) {
      await Product.updateOne(
        { _id: imageDoc.productId },
        { $push: { images: { imageId: imageDoc._id, urls: imageDoc.urls } } }
      );
    }

    return res.status(201).json({ ok: true, image: imageDoc });
  } catch (err) {
    console.error('uploadImage error', err);
    return res.status(500).json({ error: 'Upload failed' });
  }
}

/* =====================================================================
   PATCH / DETACH / DELETE
   ===================================================================== */

async function patchImage(req, res) {
  const updated = await Image.findByIdAndUpdate(
    req.params.id,
    req.body,
    { new: true }
  );
  if (!updated) return res.status(404).json({ error: 'Not found' });
  return res.json({ ok: true, image: updated });
}

async function detachImage(req, res) {
  const id = req.params.id;
  await Product.updateMany(
    { 'images.imageId': id },
    { $pull: { images: { imageId: id } } }
  );
  await Image.findByIdAndUpdate(id, { $set: { productId: null } });
  return res.json({ ok: true });
}

async function deleteImage(req, res) {
  const img = await Image.findById(req.params.id);
  if (!img) return res.status(404).json({ error: 'Not found' });

  await Image.deleteOne({ _id: img._id });
  await Product.updateMany(
    { 'images.imageId': img._id },
    { $pull: { images: { imageId: img._id } } }
  );

  return res.json({ ok: true });
}

/* =====================================================================
   EXPORTS
   ===================================================================== */

module.exports = {
  presign,       // Optional, guarded
  uploadImage,   // Production path
  patchImage,
  detachImage,
  deleteImage
};

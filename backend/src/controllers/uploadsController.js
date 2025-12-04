// backend/src/controllers/uploadsController.js
const path = require('path');
const fs = require('fs');
const fsp = fs.promises;
const sharp = require('sharp');
const { randomUUID } = require('crypto');
const mongoose = require('mongoose');

const Image = require('../models/image');
const Product = require('../models/Product');

const UPLOAD_BASE = path.join(process.cwd(), 'uploads', 'images');
const SUBFOLDERS = { thumb: 'thumb', medium: 'medium', original: 'original' };

// Ensure directories exist (idempotent)
function ensureDirSync(dir) {
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
}
ensureDirSync(UPLOAD_BASE);

/* ------------------------- Helpers ------------------------- */

function extFromName(name) {
  const e = path.extname(name || '').toLowerCase();
  return e || '.jpg';
}

function toRelUrl(folder, filename) {
  // relative URL expected to be served by static middleware: /uploads/images/...
  return `/uploads/images/${folder}/${filename}`;
}

async function writeSharpVariants(buffer, destDir, baseName, ext) {
  // Writes thumb (300), medium (1024), original (as-is)
  const thumbName = `${baseName}-thumb${ext}`;
  const mediumName = `${baseName}-medium${ext}`;
  const origName = `${baseName}-orig${ext}`;

  const thumbPath = path.join(destDir, SUBFOLDERS.thumb, thumbName);
  const mediumPath = path.join(destDir, SUBFOLDERS.medium, mediumName);
  const origPath = path.join(destDir, SUBFOLDERS.original, origName);

  // ensure subfolders
  await Promise.all(Object.values(SUBFOLDERS).map(d => fsp.mkdir(path.join(destDir, d), { recursive: true })));

  // write files
  await Promise.all([
    sharp(buffer).resize({ width: 300, withoutEnlargement: true }).toFile(thumbPath),
    sharp(buffer).resize({ width: 1024, withoutEnlargement: true }).toFile(mediumPath),
    sharp(buffer).toFile(origPath)
  ]);

  return {
    filenames: { thumb: path.join(String(destDir).replace(process.cwd() + path.sep, ''), SUBFOLDERS.thumb, thumbName) },
    names: { thumb: thumbName, medium: mediumName, original: origName },
    paths: { thumbPath, mediumPath, origPath },
    rels: {
      thumb: toRelUrl(path.relative(path.join(process.cwd(), 'uploads', 'images'), path.join(destDir, SUBFOLDERS.thumb)).replace(/\\/g, '/'), thumbName),
      medium: toRelUrl(path.relative(path.join(process.cwd(), 'uploads', 'images'), path.join(destDir, SUBFOLDERS.medium)).replace(/\\/g, '/'), mediumName),
      original: toRelUrl(path.relative(path.join(process.cwd(), 'uploads', 'images'), path.join(destDir, SUBFOLDERS.original)).replace(/\\/g, '/'), origName)
    }
  };
}

// Build the full relative url path: we decide to store `/uploads/images/YYYY/MM/<folder>/<file>`
// In our storage layout we included the year/month in destDir, so rels created above are relative to images root.
// To make them absolute under /uploads/images root:
function makeFinalUrls(rels, yearMonthPrefix = '') {
  // rels currently like `/uploads/images/<subpath>/<file>` or with relative partials; normalize
  const res = {};
  for (const k of Object.keys(rels)) {
    const val = String(rels[k]).replace(/\\/g, '/');
    if (val.startsWith('/uploads')) res[k] = val;
    else res[k] = `/uploads/images/${val}`.replace(/\/+/g, '/');
  }
  return res;
}

// Remove provided files (best-effort)
async function safeRemoveFiles(paths = []) {
  for (const p of paths) {
    if (!p) continue;
    try {
      await fsp.unlink(p);
      console.log('Deleted file', p);
    } catch (err) {
      if (err.code !== 'ENOENT') {
        console.warn('Failed to delete', p, err.message);
      } // else ignore missing files
    }
  }
}

/* ------------------------- Controller actions ------------------------- */

/**
 * POST /admin/upload
 */
async function uploadImage(req, res) {
  try {
    if (!req.file) return res.status(400).json({ error: 'No file uploaded' });
    if (!req.file.mimetype || !req.file.mimetype.startsWith('image/')) {
      return res.status(400).json({ error: 'Only images allowed' });
    }

    // validate buffer quickly (sharp will throw on invalid)
    try {
      await sharp(req.file.buffer).metadata();
    } catch (err) {
      return res.status(400).json({ error: 'Invalid image file' });
    }

    const now = new Date();
    const YYYY = now.getFullYear();
    const MM = String(now.getMonth() + 1).padStart(2, '0');
    const destDir = path.join(UPLOAD_BASE, String(YYYY), MM);

    ensureDirSync(destDir);

    // names
    const id = randomUUID();
    const ext = extFromName(req.file.originalname);
    const baseName = id;

    // write files
    let variants;
    try {
      variants = await writeSharpVariants(req.file.buffer, destDir, baseName, ext);
    } catch (err) {
      console.error('Failed to write image variants:', err);
      return res.status(500).json({ error: 'Failed to process image' });
    }

    // get metadata (width/height) from original
    let metadata = {};
    try {
      metadata = await sharp(req.file.buffer).metadata();
    } catch (err) {
      // not critical
      console.warn('Failed to read metadata', err.message);
    }

    // prepare DB doc
    const filenamesObj = {
      thumb: path.join('images', String(YYYY), MM, SUBFOLDERS.thumb, variants.names.thumb).replace(/\\/g, '/'),
      medium: path.join('images', String(YYYY), MM, SUBFOLDERS.medium, variants.names.medium).replace(/\\/g, '/'),
      original: path.join('images', String(YYYY), MM, SUBFOLDERS.original, variants.names.original).replace(/\\/g, '/')
    };

    // build relative URLs that the frontend can use directly
    const urls = {
      thumb: `/uploads/${filenamesObj.thumb}`,
      medium: `/uploads/${filenamesObj.medium}`,
      original: `/uploads/${filenamesObj.original}`
    };

    const doc = {
      title: req.body.title || req.file.originalname || '',
      description: req.body.description || '',
      filenames: filenamesObj,
      urls,
      contentType: req.file.mimetype,
      size: req.file.size,
      width: metadata.width || null,
      height: metadata.height || null,
      uploadedBy: req.user && req.user.email ? req.user.email : (req.headers['x-admin-user'] || 'admin'),
      productId: req.body.productId && mongoose.Types.ObjectId.isValid(req.body.productId)
        ? mongoose.Types.ObjectId(req.body.productId) : null,
      page: req.body.page || null,
      slot: req.body.slot || null,
      role: req.body.role || null,
      order: req.body.order ? Number(req.body.order) : 0,
      version: 1
    };

    // optional: handle replaceImageId to bump version
    if (req.body.replaceImageId && mongoose.Types.ObjectId.isValid(req.body.replaceImageId)) {
      const old = await Image.findById(req.body.replaceImageId).lean();
      if (old) doc.version = (old.version || 1) + 1;
    }

    // Save DB doc - in case of DB failure, we should remove files we wrote
    let saved;
    try {
      saved = await Image.create(doc);
    } catch (err) {
      // rollback files
      const { paths } = variants;
      await safeRemoveFiles([paths.thumbPath, paths.mediumPath, paths.origPath]);
      console.error('Failed saving Image doc:', err);
      return res.status(500).json({ error: 'Failed to persist image metadata' });
    }

    // Attach to product if provided
    if (saved.productId) {
      try {
        await Product.updateOne(
          { _id: saved.productId },
          {
            $push: {
              images: {
                imageId: saved._id,
                urls: saved.urls,
                title: saved.title,
                description: saved.description,
                role: saved.role,
                order: saved.order
              }
            }
          }
        );
      } catch (err) {
        console.warn('Failed to attach image to product:', err.message);
        // non-fatal
      }
    }

    return res.status(201).json({ ok: true, id: saved._id, meta: saved });
  } catch (err) {
    console.error('uploadImage unexpected error', err);
    return res.status(500).json({ error: 'Upload failed', details: err.message });
  }
}

/**
 * PATCH /admin/upload/:id
 */
async function patchImage(req, res) {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) return res.status(400).json({ error: 'Invalid id' });

    const update = {};
    if ('title' in req.body) update.title = String(req.body.title || '').slice(0, 200);
    if ('description' in req.body) update.description = String(req.body.description || '').slice(0, 2000);
    if ('page' in req.body) update.page = req.body.page || null;
    if ('slot' in req.body) update.slot = req.body.slot || null;
    if ('role' in req.body) update.role = req.body.role || null;
    if ('order' in req.body) update.order = req.body.order ? Number(req.body.order) : 0;

    const updated = await Image.findByIdAndUpdate(id, update, { new: true });
    if (!updated) return res.status(404).json({ error: 'Not found' });

    // optionally manage product associations if client provided add/remove product ids
    if (req.body.addToProductId && mongoose.Types.ObjectId.isValid(req.body.addToProductId)) {
      try {
        const prod = await Product.findById(req.body.addToProductId);
        if (prod) {
          if (Array.isArray(prod.images)) {
            if (!prod.images.some(it => String(it.imageId || it) === String(updated._id))) {
              prod.images.push({ imageId: updated._id, urls: updated.urls, title: updated.title });
              await prod.save();
            }
          } else if (!prod.image) {
            prod.image = updated._id;
            await prod.save();
          }
        }
      } catch (err) {
        console.warn('Failed to add image to product:', err.message);
      }
    }
    if (req.body.removeFromProductId && mongoose.Types.ObjectId.isValid(req.body.removeFromProductId)) {
      try {
        await Product.updateOne(
          { _id: req.body.removeFromProductId },
          { $pull: { images: { imageId: updated._id } } }
        );
        await Product.updateOne(
          { _id: req.body.removeFromProductId, image: updated._id },
          { $unset: { image: '' } }
        );
      } catch (err) {
        console.warn('Failed to remove image from product:', err.message);
      }
    }

    return res.json({ ok: true, meta: updated });
  } catch (err) {
    console.error('patchImage error', err);
    return res.status(500).json({ error: err.message });
  }
}

/**
 * POST /admin/upload/:id/detach
 * Keep file + Image doc, only remove product references and clear productId on image doc
 */
async function detachImage(req, res) {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const objId = new mongoose.Types.ObjectId(String(id));

    // Remove embedded references in products: images array objects { imageId: ... }
    // and unset single-image fields (image, imageId) if present.
    await Product.updateMany(
      { 'images.imageId': objId },
      { $pull: { images: { imageId: objId } } }
    );

    await Product.updateMany(
      { $or: [{ image: objId }, { imageId: objId }] },
      { $unset: { image: '', imageId: '' } }
    );

    // Clear productId stored on the Image document (if you store it)
    await Image.findByIdAndUpdate(id, { $set: { productId: null } }).exec();

    return res.json({ ok: true, message: 'Image detached from products' });
  } catch (err) {
    console.error('detachImage error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: err && err.message ? err.message : 'Detach failed' });
  }
}


/**
 * DELETE /admin/upload/:id
 * Remove files, Image doc, and product refs
 */

async function deleteImage(req, res) {
  try {
    const { id } = req.params;
    const mongoose = require('mongoose');

    if (!mongoose.isValidObjectId(id)) {
      return res.status(400).json({ error: 'Invalid id' });
    }

    const img = await Image.findById(id).lean();
    if (!img) return res.status(404).json({ error: 'Image not found' });

    // Build absolute file paths from stored filenames (we store 'images/...')
    const filePaths = [];
    if (img.filenames) {
      for (const v of Object.values(img.filenames)) {
        if (!v) continue;
        // remove leading /uploads/ if present and join with process.cwd()/uploads
        const rel = String(v).replace(/^\/?uploads\/?/, '').replace(/^\/?/, '');
        const abs = path.join(process.cwd(), 'uploads', rel);
        filePaths.push(abs);
      }
    }

    // delete files (best-effort)
    await Promise.all(filePaths.map(async p => {
      try {
        await fs.promises.unlink(p);
        console.log('Deleted file', p);
      } catch (err) {
        if (err.code !== 'ENOENT') console.warn('Failed to delete file', p, err.message);
      }
    }));

    // Delete DB doc
    await Image.deleteOne({ _id: img._id });

    // Remove references in products robustly:
    // - Remove from images array objects with imageId
    // - Unset single-image fields (image, imageId)
    const objId = new mongoose.Types.ObjectId(String(id));

    await Product.updateMany(
      { 'images.imageId': objId },
      { $pull: { images: { imageId: objId } } }
    );

    await Product.updateMany(
      { $or: [{ image: objId }, { imageId: objId }] },
      { $unset: { image: "", imageId: "" } }
    );

    return res.json({ ok: true, deleted: id });
  } catch (err) {
    console.error('deleteImage error', err && (err.stack || err.message || err));
    return res.status(500).json({ error: 'Delete failed', details: err && err.message ? err.message : 'unknown' });
  }
}


module.exports = {
  uploadImage,
  patchImage,
  detachImage,
  deleteImage
};

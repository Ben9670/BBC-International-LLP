// backend/src/models/UploadImage.js
const mongoose = require('mongoose');
const { Schema } = mongoose;

const allowablePages = ['home', 'category', 'product', 'collection', null];
const allowableRoles = ['primary', 'gallery', 'thumb', 'banner', 'hero', null];

/**
 * Sub-schemas for filenames and urls.
 * NOTE: thumb/medium are optional (default '') because confirm flow will usually provide only original.
 */
const filenameSchema = new Schema(
  {
    thumb: { type: String, default: '' },
    medium: { type: String, default: '' },
    original: { type: String, required: true }, // key/path in R2 or storage
  },
  { _id: false }
);

const urlSchema = new Schema(
  {
    thumb: { type: String, default: '' },
    medium: { type: String, default: '' },
    original: { type: String, required: true }, // publicly accessible URL (CDN/R2)
  },
  { _id: false }
);

/**
 * New-style metadata container. We keep top-level contentType/size for
 * backward compatibility but recommend using metadata.* going forward.
 */
const metadataSchema = new Schema(
  {
    contentType: { type: String, default: '' },
    size: { type: Number, default: null, min: 0 }, // bytes
    width: { type: Number, default: null, min: 0 },
    height: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

/**
 * Thumbnail sub-objects (thumb and medium)
 */
const thumbMetaSchema = new Schema(
  {
    filename: { type: String, default: '' }, // key/path on R2
    url: { type: String, default: '' },      // public URL
    width: { type: Number, default: null, min: 0 },
    height: { type: Number, default: null, min: 0 },
    size: { type: Number, default: null, min: 0 },
  },
  { _id: false }
);

/**
 * Main image schema
 */
const imageSchema = new Schema(
  {
    // basic
    title: { type: String, trim: true, default: '' },
    description: { type: String, trim: true, default: '' },

    // filenames + urls (original required, others optional)
    filenames: { type: filenameSchema, required: true },
    urls: { type: urlSchema, required: true },

    // Backwards-compatible top-level fields (kept for older code)
    contentType: { type: String, default: '' }, // deprecated — prefer metadata.contentType
    size: { type: Number, default: null, min: 0 }, // deprecated — prefer metadata.size

    // structured metadata (new preferred place)
    metadata: { type: metadataSchema, default: () => ({}) },

    // placement / UI hints
    page: { type: String, enum: allowablePages, default: null },
    slot: { type: String, trim: true, default: null }, // free-form slot name like 'hero' or 'banner1'
    role: { type: String, enum: allowableRoles, default: null },

    // ordering for images in a gallery / slot
    order: { type: Number, default: 0, min: 0 },

    // Relation to product
    // Keep both for compatibility: `product` (preferred) and `productId` (legacy)
    product: { type: Schema.Types.ObjectId, ref: 'Product', default: null },
    productId: { type: Schema.Types.ObjectId, ref: 'Product', default: null }, // legacy alias

    // Thumbnail information (Priority #6)
    thumbnails: {
      thumb: { type: thumbMetaSchema, default: () => ({}) },
      medium: { type: thumbMetaSchema, default: () => ({}) },
    },
    thumbnailsGenerated: { type: Boolean, default: false },

    thumbnailJob: {
      status: { type: String, enum: ['pending', 'processing', 'done', 'failed'], default: 'pending' },
      startedAt: { type: Date, default: null },
      finishedAt: { type: Date, default: null },
      workerId: { type: String, default: null },
      error: { type: String, default: '' },
    },

    lastThumbnailUpdatedAt: { type: Date, default: null },

    // Audit: createdBy (new) and uploadedBy (legacy string field; kept for old code)
    createdBy: { type: Schema.Types.ObjectId, ref: 'User', default: null },
    uploadedBy: { type: String, default: 'admin' }, // legacy usage

    // Flags and versioning
    version: { type: Number, default: 1 }, // increment when replacing same logical image
    processed: { type: Boolean, default: false },
    deleted: { type: Boolean, default: false }, // soft delete
  },
  {
    collection: 'images', // keep existing collection name
    timestamps: true, // createdAt + updatedAt
    toJSON: { virtuals: true },
    toObject: { virtuals: true },
  }
);

/**
 * Virtuals for convenience / backward compatibility
 */
imageSchema.virtual('publicUrl').get(function () {
  return (this.urls && this.urls.original) || null;
});

// Keep a virtual getter for legacy `productId` usage when reading documents.
imageSchema.virtual('legacyProductId').get(function () {
  return this.product || this.productId || null;
});

/**
 * Pre-save hook: keep product <-> productId in sync.
 * Also copy createdBy -> uploadedBy (string) for legacy systems if createdBy is available.
 */
imageSchema.pre('save', function (next) {
  try {
    // sync ObjectId copies (keep product & productId consistent)
    if (this.product && !this.productId) {
      this.productId = this.product;
    } else if (!this.product && this.productId) {
      this.product = this.productId;
    }

    // copy createdBy to uploadedBy if uploadedBy is still default and createdBy exists
    if (this.createdBy && (!this.uploadedBy || this.uploadedBy === 'admin')) {
      try {
        this.uploadedBy = String(this.createdBy);
      } catch (e) {
        // ignore conversion errors
      }
    }

    // If Mongoose provided a `next` callback, call it.
    // Otherwise simply return (modern Mongoose may expect the hook to return/finish).
    if (typeof next === 'function') {
      return next();
    }
    return;
  } catch (err) {
    // If an unexpected error occurs, forward it via next if available; otherwise throw.
    if (typeof next === 'function') return next(err);
    throw err;
  }
});


/**
 * Indexes for common lookups
 * (Index definitions centralized here; remove inline `index: true` to avoid duplicate index warnings)
 */
imageSchema.index({ product: 1, order: 1 });
imageSchema.index({ productId: 1 });
imageSchema.index({ page: 1, slot: 1 });
imageSchema.index({ role: 1 });
imageSchema.index({ createdBy: 1, createdAt: -1 });
imageSchema.index({ thumbnailsGenerated: 1, lastThumbnailUpdatedAt: -1 });

module.exports = mongoose.model('UploadImage', imageSchema);

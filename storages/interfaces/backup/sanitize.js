/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

/**
 * Sanitize exported documents by stripping engine-specific internal fields.
 *
 * MongoDB exportAll() returns raw docs with `_id`, `userId`, `__v`.
 * PostgreSQL exportAll() returns clean camelCase data (already stripped).
 * SQLite exportAll() returns raw rows.
 *
 * This module normalizes all engine outputs to clean application-level data.
 * @module storages/interfaces/backup/sanitize
 */

/**
 * Fields that are engine-internal and must be stripped from backup output.
 * These are storage-layer artifacts, not part of the application model.
 */
const INTERNAL_FIELDS = module.exports.INTERNAL_FIELDS = [
  '_id',       // MongoDB ObjectId
  '__v',       // MongoDB version key
  'userId',    // MongoDB user scoping field
  'user_id'    // PostgreSQL/SQLite user scoping field
];

/**
 * Fields whose presence indicates the document already has a meaningful
 * application-level identifier (so `_id` should NOT be promoted to `id`).
 */
const APP_ID_FIELDS = ['streamId'];

/**
 * Strip internal fields from a single document.
 * Returns a new object — does not mutate the original.
 *
 * If the document has `_id` but no `id`, and no other application-level
 * identifier (like `streamId`), then `_id` is promoted to `id`.
 * This handles MongoDB where events/accesses use `_id` as their app ID,
 * but streams use `streamId` as their app ID and `_id` is just an ObjectId.
 *
 * @param {Object} doc - raw document from exportAll()
 * @returns {Object} cleaned document
 */
module.exports.sanitize = function sanitize (doc) {
  if (doc == null) return doc;
  const clean = {};
  // Promote _id to id only if no existing id and no other app-level ID field
  if (doc._id != null && doc.id == null) {
    const hasAppId = APP_ID_FIELDS.some(f => doc[f] != null);
    if (!hasAppId) {
      clean.id = typeof doc._id === 'object' && doc._id.toString
        ? doc._id.toString()
        : doc._id;
    }
  }
  for (const key of Object.keys(doc)) {
    if (INTERNAL_FIELDS.includes(key)) continue;
    clean[key] = doc[key];
  }
  return clean;
};

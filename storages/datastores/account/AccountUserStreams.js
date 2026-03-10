/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const ds = require('@pryv/datastore');

/**
 * Account store UserStreams adapter.
 * Returns the system stream tree from config; rejects all CRUD
 * (streams are config-defined, not user-modifiable).
 *
 * @param {Array} streamTree - system stream tree (fully built, with prefixed IDs)
 * @returns {UserStreams}
 */
function create (streamTree) {
  // Build a flat index of streamId → stream for fast lookups
  const streamIndex = new Map();
  indexTree(streamTree);

  function indexTree (streams) {
    for (const s of streams) {
      streamIndex.set(s.id, s);
      if (s.children && s.children.length > 0) {
        indexTree(s.children);
      }
    }
  }

  return ds.createUserStreams({
    async get (userId, query) {
      if (query.parentId === '*' || query.parentId == null) {
        return applyQuery(streamTree, query);
      }
      const parent = streamIndex.get(query.parentId);
      if (!parent || !parent.children) return [];
      return applyQuery(parent.children, query);
    },

    async getOne (userId, streamId, query) {
      return streamIndex.get(streamId) || null;
    },

    async getDeletions (userId, deletionsSince) {
      return [];
    },

    async create (userId, streamData) {
      throw ds.errors.unsupportedOperation('Account streams are read-only (defined by configuration)');
    },

    async createDeleted (userId, streamData) {
      throw ds.errors.unsupportedOperation('Account streams are read-only (defined by configuration)');
    },

    async update (userId, updateData) {
      throw ds.errors.unsupportedOperation('Account streams are read-only (defined by configuration)');
    },

    async delete (userId, streamId) {
      throw ds.errors.unsupportedOperation('Account streams are read-only (defined by configuration)');
    }
  });
}

/**
 * Apply childrenDepth and excludedIds to a list of streams.
 */
function applyQuery (streams, query) {
  let result = streams;
  if (query.excludedIds && query.excludedIds.length > 0) {
    const excluded = new Set(query.excludedIds);
    result = result.filter(s => !excluded.has(s.id));
  }
  if (query.childrenDepth === 0) {
    result = result.map(s => Object.assign({}, s, { children: [], childrenHidden: true }));
  }
  return result;
}

module.exports = { create };

/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const ds = require('@pryv/datastore');
const { Readable } = require('stream');
const timestamp = require('unix-timestamp');

// Marker stream IDs used by the current system stream event model.
// Events always include :_system:active; unique fields also include :_system:unique.
const ACTIVE_STREAM_ID = ':_system:active';
const UNIQUE_STREAM_ID = ':_system:unique';
const MARKER_STREAM_IDS = new Set([ACTIVE_STREAM_ID, UNIQUE_STREAM_ID]);

/**
 * Account store UserEvents adapter.
 * Translates event get/create/update to baseStorage field operations.
 *
 * Each account field maps to one "event":
 *   - event.id = field name (e.g. 'email', 'language')
 *   - event.streamIds = [streamId, ':_system:active'] + optional ':_system:unique'
 *   - event.content = field value
 *   - event.type = stream's configured type
 *
 * @param {Map<string, object>} fieldStreamMap - fieldName → stream config
 *   (only leaf streams that represent actual fields, not parent containers)
 * @param {function} getStorage - returns userAccountStorage (async)
 * @returns {UserEvents}
 */
function create (fieldStreamMap, getStorage) {
  return ds.createUserEvents({

    async getOne (userId, eventId) {
      const storage = await getStorage();
      const streamConfig = fieldStreamMap.get(eventId);
      if (!streamConfig) return null;
      const value = await storage.getAccountField(userId, eventId);
      if (value == null) return null;
      return fieldToEvent(eventId, value, streamConfig);
    },

    async get (userId, query, options) {
      const storage = await getStorage();
      const fields = await storage.getAccountFields(userId);
      let events = [];
      for (const [fieldName, value] of Object.entries(fields)) {
        const streamConfig = fieldStreamMap.get(fieldName);
        if (!streamConfig) continue;
        events.push(fieldToEvent(fieldName, value, streamConfig));
      }
      events = filterByQuery(events, query);
      events = applyOptions(events, options);
      return events;
    },

    async getStreamed (userId, query, options) {
      const events = await this.get(userId, query, options);
      return Readable.from(events);
    },

    async getDeletionsStreamed (userId, query, options) {
      return Readable.from([]);
    },

    async getHistory (userId, eventId) {
      const storage = await getStorage();
      const streamConfig = fieldStreamMap.get(eventId);
      if (!streamConfig) return [];
      const history = await storage.getAccountFieldHistory(userId, eventId);
      return history.map((entry) => ({
        id: eventId,
        headId: eventId,
        streamIds: buildStreamIds(streamConfig),
        type: streamConfig.type,
        content: entry.value,
        time: entry.time,
        created: entry.time,
        createdBy: entry.createdBy || 'system',
        modified: entry.time,
        modifiedBy: entry.createdBy || 'system'
      }));
    },

    async create (userId, eventData) {
      const fieldName = eventIdFromStreamIds(eventData.streamIds, fieldStreamMap);
      if (!fieldName) {
        throw ds.errors.invalidRequestStructure('Event must belong to a known account stream');
      }
      const streamConfig = fieldStreamMap.get(fieldName);
      if (!streamConfig) {
        throw ds.errors.invalidRequestStructure(`Unknown account field: ${fieldName}`);
      }
      const storage = await getStorage();
      const time = eventData.time || timestamp.now();
      const createdBy = eventData.createdBy || 'system';
      await storage.setAccountField(userId, fieldName, eventData.content, createdBy, time);
      return fieldToEvent(fieldName, eventData.content, streamConfig, time, createdBy);
    },

    async update (userId, eventData) {
      const fieldName = eventData.id;
      const streamConfig = fieldStreamMap.get(fieldName);
      if (!streamConfig) return false;
      const storage = await getStorage();
      const time = eventData.modified || timestamp.now();
      const modifiedBy = eventData.modifiedBy || 'system';
      await storage.setAccountField(userId, fieldName, eventData.content, modifiedBy, time);
      return true;
    },

    async delete (userId, eventId) {
      const streamConfig = fieldStreamMap.get(eventId);
      if (!streamConfig) {
        throw ds.errors.invalidRequestStructure(`Unknown account field: ${eventId}`);
      }
      const storage = await getStorage();
      await storage.deleteAccountField(userId, eventId);
      return { id: eventId, deleted: timestamp.now() };
    }
  });
}

/**
 * Build the full streamIds array for an event, including marker streams.
 * @param {object} streamConfig
 * @returns {string[]}
 */
function buildStreamIds (streamConfig) {
  const ids = [streamConfig.id, ACTIVE_STREAM_ID];
  if (streamConfig.isUnique) {
    ids.push(UNIQUE_STREAM_ID);
  }
  return ids;
}

/**
 * Convert a stored field to an event object.
 */
function fieldToEvent (fieldName, value, streamConfig, time, createdBy) {
  const now = time || timestamp.now();
  return {
    id: fieldName,
    streamIds: buildStreamIds(streamConfig),
    type: streamConfig.type,
    content: value,
    time: now,
    created: now,
    createdBy: createdBy || 'system',
    modified: now,
    modifiedBy: createdBy || 'system'
  };
}

/**
 * Extract the field name from an event's streamIds.
 * Skips marker streams (:_system:active, :_system:unique) and matches
 * against the fieldStreamMap to find the corresponding field.
 * @param {string[]} streamIds
 * @param {Map<string, object>} fieldMap
 * @returns {string|null}
 */
function eventIdFromStreamIds (streamIds, fieldMap) {
  if (!streamIds || streamIds.length === 0) return null;
  for (const sid of streamIds) {
    if (MARKER_STREAM_IDS.has(sid)) continue;
    const lastColon = sid.lastIndexOf(':');
    const fieldName = lastColon >= 0 ? sid.substring(lastColon + 1) : sid;
    if (fieldMap.has(fieldName)) return fieldName;
  }
  return null;
}

/**
 * Filter events by query (streams, types, state).
 *
 * Handles the normalized stream query format from Mall:
 *   query.streams = [ group1, group2, ... ]
 *   Each group is an array of conditions: [{ any: [...] }, { not: [...] }, ...]
 *   Within a group: AND (all conditions must match)
 *   Between groups: OR (any group matching is enough)
 */
function filterByQuery (events, query) {
  if (!query) return events;

  // Account events are never trashed — return empty for 'trashed' state
  if (query.state === 'trashed') {
    return [];
  }

  if (query.streams && query.streams.length > 0) {
    events = events.filter(e => matchesStreamQuery(e.streamIds, query.streams));
  }

  if (query.types && query.types.length > 0) {
    const typeSet = new Set(query.types);
    events = events.filter(e => typeSet.has(e.type));
  }

  // Account events are never "running" period events (no duration concept)
  if (query.running === true) {
    return [];
  }

  if (query.fromTime != null) {
    events = events.filter(e => e.time >= query.fromTime);
  }
  if (query.toTime != null) {
    events = events.filter(e => e.time < query.toTime);
  }

  if (query.modifiedSince != null) {
    events = events.filter(e => e.modified >= query.modifiedSince);
  }

  return events;
}

/**
 * Check if an event's streamIds match the normalized stream query.
 * @param {string[]} eventStreamIds
 * @param {Array} streamGroups - normalized stream query groups
 * @returns {boolean}
 */
function matchesStreamQuery (eventStreamIds, streamGroups) {
  const sids = new Set(eventStreamIds);
  // OR between groups
  for (const group of streamGroups) {
    if (matchesGroup(sids, group)) return true;
  }
  return false;
}

/**
 * Check if streamIds match all conditions in a group (AND).
 * A group is an array of condition objects: { any: [...] } or { not: [...] }
 * @param {Set<string>} sids
 * @param {Array<object>} group
 * @returns {boolean}
 */
function matchesGroup (sids, group) {
  // Handle both normalized format (array of conditions) and simple format (single object)
  const conditions = Array.isArray(group) ? group : [group];
  for (const cond of conditions) {
    if (cond.any) {
      // At least one of 'any' must be in the event's streamIds
      if (!cond.any.some(sid => sids.has(sid))) return false;
    }
    if (cond.not) {
      // None of 'not' must be in the event's streamIds
      if (cond.not.some(sid => sids.has(sid))) return false;
    }
  }
  return true;
}

/**
 * Apply skip/limit/sort options.
 */
function applyOptions (events, options) {
  if (!options) return events;
  if (options.sortAscending === true) {
    events.sort((a, b) => a.time - b.time);
  } else if (options.sortAscending === false) {
    events.sort((a, b) => b.time - a.time);
  }
  if (options.skip) {
    events = events.slice(options.skip);
  }
  if (options.limit) {
    events = events.slice(0, options.limit);
  }
  return events;
}

module.exports = { create };

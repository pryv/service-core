/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const ds = require('@pryv/datastore');
const { Readable } = require('stream');
const timestamp = require('unix-timestamp');

/**
 * Account store UserEvents adapter.
 * Translates event get/create/update to baseStorage field operations.
 *
 * Each account field maps to one "event":
 *   - event.id = field name (e.g. 'email', 'language')
 *   - event.streamIds = [streamId] (the stream this field belongs to)
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
      return history.map((entry, i) => ({
        id: eventId,
        headId: eventId,
        streamIds: [streamConfig.id],
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
      const fieldName = eventIdFromStreamIds(eventData.streamIds);
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
 * Convert a stored field to an event object.
 */
function fieldToEvent (fieldName, value, streamConfig, time, createdBy) {
  const now = time || timestamp.now();
  return {
    id: fieldName,
    streamIds: [streamConfig.id],
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
 * Matches against the fieldStreamMap to find the corresponding field.
 */
function eventIdFromStreamIds (streamIds) {
  // streamIds contains prefixed IDs like ':_system:email'
  // The field name is the last segment after the last ':'
  if (!streamIds || streamIds.length === 0) return null;
  for (const sid of streamIds) {
    const lastColon = sid.lastIndexOf(':');
    if (lastColon >= 0) {
      return sid.substring(lastColon + 1);
    }
  }
  return null;
}

/**
 * Filter events by query (streams, types, state).
 */
function filterByQuery (events, query) {
  if (!query) return events;

  if (query.streams && query.streams.length > 0) {
    const allowedStreamIds = new Set();
    for (const sq of query.streams) {
      if (sq.any) {
        for (const sid of sq.any) {
          allowedStreamIds.add(sid);
        }
      }
    }
    if (allowedStreamIds.size > 0) {
      events = events.filter(e =>
        e.streamIds.some(sid => allowedStreamIds.has(sid))
      );
    }
  }

  if (query.types && query.types.length > 0) {
    const typeSet = new Set(query.types);
    events = events.filter(e => typeSet.has(e.type));
  }

  if (query.fromTime != null) {
    events = events.filter(e => e.time >= query.fromTime);
  }
  if (query.toTime != null) {
    events = events.filter(e => e.time < query.toTime);
  }

  return events;
}

/**
 * Apply skip/limit/sort options.
 */
function applyOptions (events, options) {
  if (!options) return events;
  if (options.sort && options.sort.time === -1) {
    events.sort((a, b) => b.time - a.time);
  } else if (options.sort && options.sort.time === 1) {
    events.sort((a, b) => a.time - b.time);
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

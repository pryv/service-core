/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const SQLite3 = require('better-sqlite3');
const { Readable } = require('stream');

const concurrentSafeWrite = require('../sqliteUtils/concurrentSafeWrite');
const eventsSchema = require('./schema/events');
const fullTextSearch = require('./fullTextSearch');
const { toSQLiteQuery } = require('./streamQueryUtils');

module.exports = UserDatabase;

const DB_OPTIONS = {};

const tableSchemas = {
  events: eventsSchema.dbSchema
};

/**
 * @param {Object} params
 * @param {string} params.dbPath Path to the SQLite database file
 */
function UserDatabase (logger, params) {
  this.logger = logger.getLogger('user-database');
  this.db = new SQLite3(params.dbPath, DB_OPTIONS);
}

UserDatabase.prototype.init = async function () {
  await concurrentSafeWrite.initWALAndConcurrentSafeWriteCapabilities(this.db);
  // here we might want to skip DB initialization if version is not null

  this.eventQueries = {};

  // create all tables
  for (const tableName of Object.keys(tableSchemas)) {
    const columnNames = Object.keys(tableSchemas[tableName]);
    const columnTypes = [];
    const indexes = [];
    columnNames.forEach((columnName) => {
      const column = tableSchemas[tableName][columnName];
      columnTypes.push(`${columnName} ${column.type}`);
      if (column.index) { indexes.push(columnName); }
    });

    await concurrentSafeWrite.execute(() => {
      this.db.prepare(`CREATE TABLE IF NOT EXISTS ${tableName} (${columnTypes.join(', ')});`).run();
    });

    for (const columnName of indexes) {
      await concurrentSafeWrite.execute(() => {
        this.db.prepare(`CREATE INDEX IF NOT EXISTS ${tableName}_${columnName} ON ${tableName}(${columnName})`).run();
      });
    }
  }

  // setup events queries

  // TODO: reorder consistently

  this.eventQueries.getAll = prepareGetAllQuery(this.db, 'events');

  fullTextSearch.setupForTable(this.db, 'events', tableSchemas.events, ['streamIds']);
  this.eventQueries.getTerms = this.db.prepare('SELECT * FROM events_fts_v WHERE term like ?');

  this.eventQueries.getById = this.db.prepare('SELECT * FROM events WHERE eventid = ?');
  this.eventQueries.getDeletedSince = this.db.prepare('SELECT * from events WHERE deleted >= ? ORDER BY deleted DESC');
  this.eventQueries.getHistory = this.db.prepare('SELECT * from events WHERE headId = ? ORDER BY modified ASC');

  this.eventQueries.create = prepareCreateQuery(this.db, 'events', Object.keys(tableSchemas.events));

  this.eventQueries.deleteByHeadId = this.db.prepare('DELETE FROM events WHERE headId = ?');
  this.eventQueries.deleteById = this.db.prepare('DELETE FROM events WHERE eventid = ?');
};

function prepareGetAllQuery (db, tableName) {
  return db.prepare(`SELECT * FROM ${tableName}`);
}

function prepareCreateQuery (db, tableName, columnNames) {
  return db.prepare(`INSERT INTO ${tableName} (${columnNames.join(', ')}) VALUES (@${columnNames.join(', @')})`);
}

UserDatabase.prototype.close = function () {
  this.db.close();
};

UserDatabase.prototype.getEvents = function (params) {
  params.query.push({ type: 'equal', content: { field: 'deleted', value: null } });
  params.query.push({ type: 'equal', content: { field: 'headId', value: null } });
  const queryString = prepareEventsGetQuery(params);
  this.logger.debug(`GET events: ${queryString}`);
  const res = this.db.prepare(queryString).all();
  if (res != null) {
    return res.map(eventsSchema.fromDB);
  }
  return null;
};

UserDatabase.prototype.getEventsStreamed = function (params) {
  params.query.push({ type: 'equal', content: { field: 'deleted', value: null } });
  params.query.push({ type: 'equal', content: { field: 'headId', value: null } });
  const queryString = prepareEventsGetQuery(params);
  this.logger.debug(`GET events streamed: ${queryString}`);
  const query = this.db.prepare(queryString);
  return readableEventsStreamForIterator(query.iterate());
};

function prepareEventsGetQuery (params) {
  return 'SELECT * FROM events_fts ' + prepareQuery(params);
}

UserDatabase.prototype.getEventDeletionsStreamed = function (deletedSince) {
  this.logger.debug(`GET events deletions since: ${deletedSince}`);
  return readableEventsStreamForIterator(this.eventQueries.getDeletedSince.iterate(deletedSince));
};

// also see: https://nodejs.org/api/stream.html#stream_stream_readable_from_iterable_options
function readableEventsStreamForIterator (iterateSource) {
  const iterateTransform = {
    next: function () {
      const res = iterateSource.next();
      if (res && res.value) {
        res.value = eventsSchema.fromDB(res.value);
      }
      return res;
    }
  };

  iterateTransform[Symbol.iterator] = function () {
    return iterateTransform;
  };

  return Readable.from(iterateTransform);
}

UserDatabase.prototype.getAllActions = function () {
  return this.eventQueries.getTerms.all('action-%');
};

UserDatabase.prototype.getAllAccesses = function () {
  return this.eventQueries.getTerms.all('access-%');
};

UserDatabase.prototype.getOneEvent = function (eventId) {
  this.logger.debug(`GET one event: ${eventId}`);
  const event = this.eventQueries.getById.get(eventId);
  if (event == null) return null;
  return eventsSchema.fromDB(event);
};

UserDatabase.prototype.countEvents = function () {
  const res = this.db.prepare('SELECT count(*) as count FROM events').get();
  return res?.count || 0;
};

UserDatabase.prototype.createEvent = async function (event) {
  const dbEvent = eventsSchema.toDB(event);
  this.logger.debug(`(async) CREATE event: ${JSON.stringify(dbEvent)}`);
  await concurrentSafeWrite.execute(() => {
    this.eventQueries.create.run(dbEvent);
  });
};

/**
 * Use only in tests or migration
 * Not safe within a multi-process environement
 */
UserDatabase.prototype.createEventSync = function (event) {
  const dbEvent = eventsSchema.toDB(event);
  this.logger.debug(`(sync) CREATE event: ${JSON.stringify(dbEvent)}`);
  this.eventQueries.create.run(dbEvent);
};

UserDatabase.prototype.updateEvent = async function (eventId, eventData) {
  const dbEvent = eventsSchema.toDB(eventData);
  if (dbEvent.streamIds == null) { dbEvent.streamIds = eventsSchema.ALL_EVENTS_TAG; }

  delete dbEvent.eventid;
  const queryString = `UPDATE events SET ${Object.keys(dbEvent).map(field => `${field} = @${field}`).join(', ')} WHERE eventid = @eventid`;
  dbEvent.eventid = eventId;
  const update = this.db.prepare(queryString);

  await concurrentSafeWrite.execute(() => {
    const res = update.run(dbEvent);
    this.logger.debug(`UPDATE events changes: ${res.changes} eventId: ${eventId} event: ${JSON.stringify(dbEvent)}`);
    if (res.changes !== 1) {
      throw new Error('Event not found');
    }
  });

  return eventsSchema.fromDB(dbEvent);
};

UserDatabase.prototype.getEventHistory = function (eventId) {
  this.logger.debug(`GET event history for: ${eventId}`);
  return this.eventQueries.getHistory.all(eventId).map(eventsSchema.fromDBHistory);
};

UserDatabase.prototype.minimizeEventHistory = async function (eventId, fieldsToRemove) {
  const minimizeHistoryStatement = `UPDATE events SET ${fieldsToRemove.map(field => `${field} = ${field === 'streamIds' ? '\'' + eventsSchema.ALL_EVENTS_TAG + '\'' : 'NULL'}`).join(', ')} WHERE headId = ?`;
  this.logger.debug(`(async) Minimize event history: ${minimizeHistoryStatement}`);
  await concurrentSafeWrite.execute(() => {
    this.db.prepare(minimizeHistoryStatement).run(eventId);
  });
};

UserDatabase.prototype.deleteEventHistory = async function (eventId) {
  this.logger.debug(`(async) DELETE event history for event id: ${eventId}`);
  await concurrentSafeWrite.execute(() => {
    return this.eventQueries.deleteByHeadId.run(eventId);
  });
};

UserDatabase.prototype.deleteEvents = async function (params) {
  const queryString = prepareEventsDeleteQuery(params);
  if (queryString.indexOf('MATCH') > 0) {
    this.logger.debug(`DELETE events one by one as query includes "MATCH": ${queryString}`);
    // HACK: SQLite does not know how to delete with "MATCH" statement,
    //       so we're getting events that match and deleting them one by one
    const selectEventsToBeDeleted = prepareEventsGetQuery(params);

    for (const event of this.db.prepare(selectEventsToBeDeleted).iterate()) {
      this.logger.debug(`  > DELETE event: ${event.eventid}`);
      await concurrentSafeWrite.execute(() => {
        this.eventQueries.deleteById.run(event.eventid);
      });
    }
    return null;
  }
  // else
  let res = null;
  this.logger.debug(`DELETE events: ${queryString}`);
  await concurrentSafeWrite.execute(() => {
    res = this.db.prepare(queryString).run();
  });
  return res;
};

function prepareEventsDeleteQuery (params) {
  if (params.streams) { throw new Error(`Events DELETE with stream query not supported yet: ${JSON.stringify(params)}`); }
  return 'DELETE FROM events ' + prepareQuery(params, true);
}

const converters = {
  equal: (content) => {
    const realField = (content.field === 'id') ? 'eventid' : content.field;
    if (content.value === null) return `${realField} IS NULL`;
    const value = eventsSchema.coerceValueForColumn(realField, content.value);
    return `${realField} = ${value}`;
  },
  greater: (content) => {
    const value = eventsSchema.coerceValueForColumn(content.field, content.value);
    return `${content.field} > ${value}`;
  },
  greaterOrEqual: (content) => {
    const value = eventsSchema.coerceValueForColumn(content.field, content.value);
    return `${content.field} >= ${value}`;
  },
  lowerOrEqual: (content) => {
    const value = eventsSchema.coerceValueForColumn(content.field, content.value);
    return `${content.field} <= ${value}`;
  },
  greaterOrEqualOrNull: (content) => {
    const value = eventsSchema.coerceValueForColumn(content.field, content.value);
    return `(${content.field} >= ${value} OR ${content.field} IS NULL)`;
  },
  typesList: (list) => {
    if (list.length === 0) return null;
    const lt = list.map((type) => {
      const typeCorced = eventsSchema.coerceValueForColumn('type', type);
      // unsupported "*" query for types
      const starPos = typeCorced.indexOf('/*');
      if (starPos > 0) {
        const classOnly = typeCorced.substring(0, starPos);
        return `type LIKE ${classOnly}%'`;
      }
      return `type = ${typeCorced}`;
    });
    return '(' + lt.join(' OR ') + ')';
  },
  streamsQuery: (content) => {
    const str = toSQLiteQuery(content);
    if (str === null) return null;
    return 'streamIds MATCH \'' + str + '\'';
  }
};

function prepareQuery (params = {}, isDelete = false) {
  const ands = [];
  for (const item of params.query) {
    const newCondition = converters[item.type](item.content);
    if (newCondition != null) {
      ands.push(newCondition);
    }
  }

  let queryString = '';
  if (ands.length > 0) {
    queryString += ' WHERE ' + ands.join(' AND ');
  }

  if (!isDelete) {
    if (params.options?.sort) {
      const sorts = [];
      for (const [field, order] of Object.entries(params.options.sort)) {
        const orderStr = order > 0 ? 'ASC' : 'DESC';
        sorts.push(`${field} ${orderStr}`);
      }
      queryString += ' ORDER BY ' + sorts.join(', ');
    }
  }

  if (params.options?.limit) {
    queryString += ' LIMIT ' + params.options.limit;
  }

  if (params.options?.skip) {
    queryString += ' OFFSET ' + params.options.skip;
  }
  return queryString;
}

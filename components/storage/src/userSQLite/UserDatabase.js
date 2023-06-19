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
const { createFTSFor } = require('./FullTextSearchDataBase');
const { toSQLiteQuery } = require('./sqLiteStreamQueryUtils');

module.exports = UserDatabase;

const DB_OPTIONS = {};

const tables = {
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

  this.create = {};
  this.getAll = {};
  this.get = {};
  this.delete = {};

  // create all tables
  for (const tableName of Object.keys(tables)) {
    const columnsTypes = [];
    const indexes = [];
    const columnNames = Object.keys(tables[tableName]);
    columnNames.forEach((columnName) => {
      const column = tables[tableName][columnName];
      columnsTypes.push(`${columnName} ${column.type}`);
      if (column.index) { indexes.push(columnName); }
    });

    await concurrentSafeWrite.execute(() => {
      this.db.prepare('CREATE TABLE IF NOT EXISTS events ( ' +
        columnsTypes.join(', ') +
      ');').run();
    });

    for (const columnName of indexes) {
      await concurrentSafeWrite.execute(() => {
        this.db.prepare(`CREATE INDEX IF NOT EXISTS ${tableName}_${columnName} ON ${tableName}(${columnName})`).run();
      });
    }

    this.create[tableName] = this.db.prepare(`INSERT INTO ${tableName} (` +
      columnNames.join(', ') + ') VALUES (@' +
      columnNames.join(', @') + ')');

    this.getAll[tableName] = this.db.prepare(`SELECT * FROM ${tableName}`);
  }

  // -- create FTS for streamIds on events
  createFTSFor(this.db, 'events', tables.events, ['streamIds']);

  this.queryGetTerms = this.db.prepare('SELECT * FROM events_fts_v WHERE term like ?');

  this.delete.eventsByHeadId = this.db.prepare('DELETE FROM events WHERE headId = ?');
  this.delete.eventById = this.db.prepare('DELETE FROM events WHERE eventid = ?');

  this.get.eventById = this.db.prepare('SELECT * FROM events WHERE eventid = ?');
  this.get.eventsDeletedSince = this.db.prepare('SELECT * from events WHERE deleted >= ? ORDER BY deleted DESC');
  this.get.eventHistory = this.db.prepare('SELECT * from events WHERE headId = ? ORDER BY modified ASC');
};

UserDatabase.prototype.updateEvent = async function (eventId, eventData) {
  const eventForDb = eventsSchema.toDB(eventData);
  if (eventForDb.streamIds == null) { eventForDb.streamIds = eventsSchema.ALL_EVENTS_TAG; }

  delete eventForDb.eventid;
  const queryString = `UPDATE events SET ${Object.keys(eventForDb).map(field => `${field} = @${field}`).join(', ')} WHERE eventid = @eventid`;
  eventForDb.eventid = eventId;
  const update = this.db.prepare(queryString);

  await concurrentSafeWrite.execute(() => {
    const res = update.run(eventForDb);
    this.logger.debug(`UPDATE events changes: ${res.changes} eventId: ${eventId} event: ${JSON.stringify(eventForDb)}`);
    if (res.changes !== 1) {
      throw new Error('Event not found');
    }
  });

  const resultEvent = eventsSchema.fromDB(eventForDb);
  return resultEvent;
};

/**
 * Use only during tests or migration
 * Not safe within a multi-process environement
 */
UserDatabase.prototype.createEventSync = function (event) {
  const eventForDb = eventsSchema.toDB(event);
  this.logger.debug(`(sync) CREATE event: ${JSON.stringify(eventForDb)}`);
  this.create.events.run(eventForDb);
};

UserDatabase.prototype.createEvent = async function (event) {
  const eventForDb = eventsSchema.toDB(event);
  this.logger.debug(`(async) CREATE event: ${JSON.stringify(eventForDb)}`);
  await concurrentSafeWrite.execute(() => {
    this.create.events.run(eventForDb);
  });
};

UserDatabase.prototype.getAllActions = function () {
  return this.queryGetTerms.all('action-%');
};

UserDatabase.prototype.getAllAccesses = function () {
  return this.queryGetTerms.all('access-%');
};

UserDatabase.prototype.deleteEventsHistory = async function (eventId) {
  this.logger.debug(`(async) DELETE event history for eventId: ${eventId}`);
  await concurrentSafeWrite.execute(() => {
    return this.delete.eventsByHeadId.run(eventId);
  });
};

UserDatabase.prototype.minimizeEventHistory = async function (eventId, fieldsToRemove) {
  const minimizeHistoryStatement = `UPDATE events SET ${fieldsToRemove.map(field => `${field} = ${field === 'streamIds' ? '\'' + eventsSchema.ALL_EVENTS_TAG + '\'' : 'NULL'}`).join(', ')} WHERE headId = ?`;
  this.logger.debug(`(async) Minimize event history: ${minimizeHistoryStatement}`);
  await concurrentSafeWrite.execute(() => {
    this.db.prepare(minimizeHistoryStatement).run(eventId);
  });
};

UserDatabase.prototype.deleteEvents = async function (params) {
  const queryString = prepareEventsDeleteQuery(params);
  if (queryString.indexOf('MATCH') > 0) {
    this.logger.debug(`DELETE events one by one as queryString includes MATCH: ${queryString}`);
    // SQLite does not know how to delete with "MATCH" statement
    // going by the doddgy task of getting events that matches the query and deleting them one by one
    const selectEventsToBeDeleted = prepareEventsGetQuery(params);

    for (const event of this.db.prepare(selectEventsToBeDeleted).iterate()) {
      this.logger.debug(`  > DELETE event: ${event.eventid}`);
      await concurrentSafeWrite.execute(() => {
        this.delete.eventById.run(event.eventid);
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

UserDatabase.prototype.getOneEvent = function (eventId) {
  this.logger.debug(`GET ONE event: ${eventId}`);
  const event = this.get.eventById.get(eventId);
  if (event == null) return null;
  return eventsSchema.fromDB(event);
};

UserDatabase.prototype.getEvents = function (params) {
  params.query.push({ type: 'equal', content: { field: 'deleted', value: null } });
  params.query.push({ type: 'equal', content: { field: 'headId', value: null } });
  const queryString = prepareEventsGetQuery(params);
  this.logger.debug(`GET Events: ${queryString}`);
  const res = this.db.prepare(queryString).all();
  if (res != null) {
    return res.map(eventsSchema.fromDB);
  }
  return null;
};

UserDatabase.prototype.getEventsStream = function (params) {
  params.query.push({ type: 'equal', content: { field: 'deleted', value: null } });
  params.query.push({ type: 'equal', content: { field: 'headId', value: null } });
  const queryString = prepareEventsGetQuery(params);
  this.logger.debug(`GET Events Stream: ${queryString}`);
  const query = this.db.prepare(queryString);
  return this.readableEventsStreamForIterator(query.iterate());
};

UserDatabase.prototype.getEventsDeletionsStream = function (deletedSince) {
  this.logger.debug(`GET Events Deletions since: ${deletedSince}`);
  return this.readableEventsStreamForIterator(this.get.eventsDeletedSince.iterate(deletedSince));
};

UserDatabase.prototype.getEventsHistory = function (eventId) {
  this.logger.debug(`GET Events History for: ${eventId}`);
  return this.get.eventHistory.all(eventId).map(eventsSchema.fromDBHistory);
};

// also see: https://nodejs.org/api/stream.html#stream_stream_readable_from_iterable_options
UserDatabase.prototype.readableEventsStreamForIterator = function (iterateSource) {
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
};

UserDatabase.prototype.eventsCount = function () {
  const res = this.db.prepare('SELECT count(*) as count FROM events').get();
  return res?.count || 0;
};

UserDatabase.prototype.close = function () {
  this.db.close();
};

// -----------------------------------------------------------------------------

function prepareEventsDeleteQuery (params) {
  if (params.streams) { throw new Error(`Events DELETE with stream query not supported yet: ${JSON.stringify(params)}`); }
  return 'DELETE FROM events ' + prepareQuery(params, true);
}

function prepareEventsGetQuery (params) {
  return 'SELECT * FROM events_fts ' + prepareQuery(params);
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

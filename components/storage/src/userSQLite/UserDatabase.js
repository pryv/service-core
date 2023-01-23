/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const SQLite3 = require('better-sqlite3');
const { Readable } = require('stream');

const eventSchemas = require('./schemas/events');
const { createFTSFor } = require('./FullTextSearchDataBase');
const events = require('./schemas/events');

const { toSQLiteQuery } = require('./sqLiteStreamQueryUtils');

const DB_OPTIONS = {};

const tables = {
  events: events.dbSchema
};

const ALL_EVENTS_TAG = events.ALL_EVENTS_TAG;

const WAIT_LIST_MS = [1, 2, 5, 10, 15, 20, 25, 25, 25, 50, 50, 100];

class UserDatabase {
  /**
   * SQLite3 instance
   */
  db;
  create;
  get;
  getAll;
  queryGetTerms;
  columnNames;
  logger;
  version;

  /**
   *
   * @param {Object} params
   * @param {string} params.dbPath // the file to use as database
   */
  constructor (logger, params) {
    this.logger = logger.getLogger('user-database');
    this.db = new SQLite3(params.dbPath, DB_OPTIONS);
  }

  async init () {
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('busy_timeout = 0'); // We take care of busy timeout ourselves as long as current driver does not go bellow the second
    this.db.unsafeMode(true);

    // here we might want to skip DB initialization if version is not null

    this.create = {};
    this.getAll = {};
    this.get = {};
    this.delete = {};
    this.columnNames = {};

    // --- Create all Tables
    Object.keys(tables).forEach((tableName) => {
      const columnsTypes = [];
      const indexes = [];
      const columnNames = Object.keys(tables[tableName]);
      columnNames.forEach((columnName) => {
        const column = tables[tableName][columnName];
        columnsTypes.push(`${columnName} ${column.type}`);
        if (column.index) indexes.push(columnName);
      });

      this.db.prepare('CREATE TABLE IF NOT EXISTS events ( ' +
        columnsTypes.join(', ') +
      ');').run();

      indexes.forEach((columnName) => {
        this.db.prepare(`CREATE INDEX IF NOT EXISTS ${tableName}_${columnName} ON ${tableName}(${columnName})`).run();
      });

      this.create[tableName] = this.db.prepare(`INSERT INTO ${tableName} (` +
        columnNames.join(', ') + ') VALUES (@' +
        columnNames.join(', @') + ')');

      this.getAll[tableName] = this.db.prepare(`SELECT * FROM ${tableName}`);
    });

    // -- create FTS for streamIds on events
    createFTSFor(this.db, 'events', tables.events, ['streamIds']);

    this.queryGetTerms = this.db.prepare('SELECT * FROM events_fts_v WHERE term like ?');

    this.delete.eventsByHeadId = this.db.prepare('DELETE FROM events WHERE headId = ?');
    this.delete.eventById = this.db.prepare('DELETE FROM events WHERE eventid = ?');

    this.get.eventById = this.db.prepare('SELECT * FROM events WHERE eventid = ?');
    this.get.eventsDeletedSince = this.db.prepare('SELECT * from events WHERE deleted >= ? ORDER BY deleted DESC');
    this.get.eventHistory = this.db.prepare('SELECT * from events WHERE headId = ? ORDER BY modified ASC');
  }

  async updateEvent (eventId, eventData) {
    const eventForDb = eventSchemas.eventToDB(eventData);

    if (eventForDb.streamIds == null) { eventForDb.streamIds = ALL_EVENTS_TAG; }

    delete eventForDb.eventid;
    const queryString = `UPDATE events SET ${Object.keys(eventForDb).map(field => `${field} = @${field}`).join(', ')} WHERE eventid = @eventid`;
    eventForDb.eventid = eventId;
    const update = this.db.prepare(queryString);

    await this.concurentSafeWriteStatement(() => {
      const res = update.run(eventForDb);
      this.logger.debug('UPDATE events changes:' + res.changes + ' eventId:' + eventId + ' event:' + JSON.stringify(eventForDb));
      if (res.changes !== 1) {
        throw new Error('Event not found');
      }
    });

    const resultEvent = eventSchemas.eventFromDB(eventForDb);
    return resultEvent;
  }

  /**
   * Use only during tests or migration
   * Not safe within a multi-process environement
   */
  createEventSync (event) {
    const eventForDb = eventSchemas.eventToDB(event);
    this.logger.debug('(sync) CREATE event:' + JSON.stringify(eventForDb));
    this.create.events.run(eventForDb);
  }

  async createEvent (event) {
    const eventForDb = eventSchemas.eventToDB(event);
    await this.concurentSafeWriteStatement(() => {
      this.logger.debug('(async) CREATE event:' + JSON.stringify(eventForDb));
      this.create.events.run(eventForDb);
    });
  }

  getAllActions () {
    return this.queryGetTerms.all('action-%');
  }

  getAllAccesses () {
    return this.queryGetTerms.all('access-%');
  }

  async deleteEventsHistory (eventId) {
    await this.concurentSafeWriteStatement(() => {
      this.logger.debug('(async) DELETE event history for eventId:' + eventId);
      return this.delete.eventsByHeadId.run(eventId);
    });
  }

  async minimizeEventHistory (eventId, fieldsToRemove) {
    const minimizeHistoryStatement = `UPDATE events SET ${fieldsToRemove.map(field => `${field} = ${field === 'streamIds' ? '\'' + ALL_EVENTS_TAG + '\'' : 'NULL'}`).join(', ')} WHERE headId = ?`;
    await this.concurentSafeWriteStatement(() => {
      this.logger.debug('(async) Minimize event history :' + minimizeHistoryStatement);
      this.db.prepare(minimizeHistoryStatement).run(eventId);
    });
  }

  async deleteEvents (params) {
    const queryString = prepareEventsDeleteQuery(params);
    if (queryString.indexOf('MATCH') > 0) {
      this.logger.debug('DELETE events one by one as queryString includes MATCH: ' + queryString);
      // SQLite does not know how to delete with "MATCH" statement
      // going by the doddgy task of getting events that matches the query and deleting them one by one
      const selectEventsToBeDeleted = prepareEventsGetQuery(params);

      for (const event of this.db.prepare(selectEventsToBeDeleted).iterate()) {
        await this.concurentSafeWriteStatement(() => {
          this.logger.debug('  > DELETE event: ' + event.eventid);
          this.delete.eventById.run(event.eventid);
        });
      }
      return null;
    }
    // else
    let res = null;
    await this.concurentSafeWriteStatement(() => {
      this.logger.debug('DELETE events: ' + queryString);
      res = this.db.prepare(queryString).run();
    });
    return res;
  }

  getOneEvent (eventId) {
    this.logger.debug('GET ONE event: ' + eventId);
    const event = this.get.eventById.get(eventId);
    if (event == null) return null;
    return eventSchemas.eventFromDB(event);
  }

  getEvents (params) {
    const queryString = prepareEventsGetQuery(params);

    this.logger.debug('GET Events:' + queryString);
    const res = this.db.prepare(queryString).all();
    if (res != null) {
      return res.map(eventSchemas.eventFromDB);
    }
    return null;
  }

  getEventsStream (params) {
    const queryString = prepareEventsGetQuery(params);
    this.logger.debug('GET Events Stream: ' + queryString);
    const query = this.db.prepare(queryString);
    return this.readableEventsStreamForIterator(query.iterate());
  }

  getEventsDeletionsStream (deletedSince) {
    this.logger.debug('GET Events Deletions since: ' + deletedSince);
    return this.readableEventsStreamForIterator(this.get.eventsDeletedSince.iterate(deletedSince));
  }

  getEventsHistory (eventId) {
    this.logger.debug('GET Events History for: ' + eventId);
    return this.get.eventHistory.all(eventId).map(eventSchemas.historyEventFromDB);
  }

  // also see: https://nodejs.org/api/stream.html#stream_stream_readable_from_iterable_options
  readableEventsStreamForIterator (iterateSource) {
    const iterateTransform = {
      next: function () {
        const res = iterateSource.next();
        if (res && res.value) {
          res.value = eventSchemas.eventFromDB(res.value);
        }
        return res;
      }
    };

    iterateTransform[Symbol.iterator] = function () {
      return iterateTransform;
    };

    return Readable.from(iterateTransform);
  }

  eventsCount () {
    const res = this.db.prepare('SELECT count(*) as count FROM events').get();
    return res?.count || 0;
  }

  close () {
    this.db.close();
  }

  /**
   * Will look "retries" times, in case of "SQLITE_BUSY".
   * This is CPU intensive, but tests have shown this solution to be efficient
   */
  async concurentSafeWriteStatement (statement, retries = 100) {
    for (let i = 0; i < retries; i++) {
      try {
        statement();
        return;
      } catch (error) {
        if (error.code !== 'SQLITE_BUSY') { // ignore
          throw error;
        }
        const waitTime = i > (WAIT_LIST_MS.length - 1) ? 100 : WAIT_LIST_MS[i];
        await new Promise((resolve) => setTimeout(resolve, waitTime));
        this.logger.debug('SQLITE_BUSY, retrying in ' + waitTime + 'ms');
      }
    }
    throw new Error('Failed write action on Audit after ' + retries + ' retries');
  }
}

function prepareEventsDeleteQuery (params) {
  if (params.streams) { throw new Error('events DELETE with stream query not supported yet: ' + JSON.stringify(params)); }
  return 'DELETE FROM events ' + prepareQuery(params, true);
}

function prepareEventsGetQuery (params) {
  return 'SELECT * FROM events_fts ' + prepareQuery(params);
}

const converters = {
  equal: (content) => {
    const realField = (content.field === 'id') ? 'eventid' : content.field;
    if (content.value === null) return `${realField} IS NULL`;
    const value = events.coerceSelectValueForColumn(realField, content.value);
    return `${realField} = ${value}`;
  },
  greater: (content) => {
    const value = events.coerceSelectValueForColumn(content.field, content.value);
    return `${content.field} > ${value}`;
  },
  greaterOrEqual: (content) => {
    const value = events.coerceSelectValueForColumn(content.field, content.value);
    return `${content.field} >= ${value}`;
  },
  lowerOrEqual: (content) => {
    const value = events.coerceSelectValueForColumn(content.field, content.value);
    return `${content.field} <= ${value}`;
  },
  greaterOrEqualOrNull: (content) => {
    const value = events.coerceSelectValueForColumn(content.field, content.value);
    return `(${content.field} >= ${value} OR ${content.field} IS NULL)`;
  },
  typesList: (list) => {
    if (list.length === 0) return null;
    const lt = list.map((type) => {
      const typeCorced = events.coerceSelectValueForColumn('type', type);
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

module.exports = UserDatabase;

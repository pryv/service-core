/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const sqlite3 = require('better-sqlite3');
const eventSchemas = require('./schemas/events')
const {createFTSFor } = require('./FullTextSearchDataBase');
const events = require('./schemas/events');
const { getLogger } = require('@pryv/boiler');
const { Readable } = require('stream');

const { toSQLiteQuery } = require('audit/src/storage/sqLiteStreamQueryUtils');

const DB_OPTIONS = {

};

const tables = {
  events: events.dbSchema
}

const WAIT_LIST_MS = [1, 2, 5, 10, 15, 20, 25, 25,  25,  50,  50, 100];

const DELTA_TO_CONSIDER_IS_NOW = 5; // 5 seconds
class UserDatabase {
  /**
   * sqlite3 instance
   */
  db;
  create;
  get;
  getAll;
  queryGetTerms;
  columnNames;
  logger;

  /**
   * 
   * @param {Object} params
   * @param {string} params.dbPath // the file to use as database
   */
  constructor(logger, params) {
    this.logger = logger.getLogger('user-database');
    const db = new sqlite3(params.dbPath, DB_OPTIONS);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 0'); // We take care of busy timeout ourselves as long as current driver does not go bellow the second
    db.unsafeMode(true);
    this.create = {};
    this.getAll = {};
    this.get = {};
    this.columnNames = {};

    // --- Create all Tables
    Object.keys(tables).map((tableName) => {
      const columnsTypes = [];
      const indexes = [];
      const columnNames = Object.keys(tables[tableName]);
      columnNames.map((columnName) => {
        const column = tables[tableName][columnName];
        columnsTypes.push(`${columnName} ${column.type}`);
        if (column.index) indexes.push(columnName);
      });

      db.prepare('CREATE TABLE IF NOT EXISTS events ( ' +
        columnsTypes.join(', ') +
      ');').run();

      indexes.map((columnName) => {
        db.prepare(`CREATE INDEX IF NOT EXISTS ${tableName}_${columnName} ON ${tableName}(${columnName})`).run();
      });

      this.create[tableName] = db.prepare(`INSERT INTO ${tableName} (` + 
        columnNames.join(', ') + ') VALUES (@' +
        columnNames.join(', @') + ')');

      this.getAll[tableName] = db.prepare(`SELECT * FROM ${tableName}`);
    });

    // -- create FTS for streamIds on events
    createFTSFor(db, 'events', tables['events'], ['streamIds']);

    this.queryGetTerms = db.prepare('SELECT * FROM events_fts_v WHERE term like ?');
    
    this.db = db;
  }

  async updateEvent(eventId, eventData) {
    const eventForDb = eventSchemas.eventToDB(eventData);
   
    if (eventForDb.streamIds == null) { eventForDb.streamIds = '..'; }

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
    }, 10000); 

    
    const resultEvent = eventSchemas.eventFromDB(eventForDb);
    return resultEvent;
  }


  /**
   * Use only during tests or migration
   * Not safe within a multi-process environement
   */
  createEventSync(event) {
    const eventForDb = eventSchemas.eventToDB(event);
    this.create.events.run(eventForDb);
    this.logger.debug('(sync) CREATE event:' + JSON.stringify(eventForDb));
  }  

  async createEvent(event) {
    const eventForDb = eventSchemas.eventToDB(event);
    await this.concurentSafeWriteStatement(() => {
      this.create.events.run(eventForDb);
      this.logger.debug('(async) CREATE event:' + JSON.stringify(eventForDb));
    }, 10000);
  }

  getAllActions() {
    return this.queryGetTerms.all('action-%');
  }

  getAllAccesses() {
    return this.queryGetTerms.all('access-%');
  }

  deleteEvents(params) {
    const queryString = prepareEventsDeleteQuery(params);
    this.logger.debug('DELETE events: ' +queryString);
    const res = this.db.prepare(queryString).run();
    return res;
  }

  getEvents(params) {
    const queryString = prepareEventsGetQuery(params);
    
    this.logger.debug('GET Events:' + queryString);
    const res = this.db.prepare(queryString).all();
    if (res != null) {
      return res.map(eventSchemas.eventFromDB);
    }
    return null;
  }

  // also see: https://nodejs.org/api/stream.html#stream_stream_readable_from_iterable_options

  getEventsStream(params) {
    const queryString = prepareEventsGetQuery(params);
    this.logger.debug('GET Events Stream:' + queryString);

    const iterateSource = this.db.prepare(queryString).iterate();

    const iterateTransform = {
      next: function() {
        const res = iterateSource.next();
        if (res && res.value) {
          res.value = eventSchemas.eventFromDB(res.value);
        }
        return res;
      }
    };

    iterateTransform[Symbol.iterator] = function() {
      return iterateTransform;
    }

    return Readable.from(iterateTransform);
  }

  eventsCount() {
    const res = this.db.prepare('SELECT count(*) as count FROM events').get();
    return res?.count || 0;
  }


  close() {
    this.db.close();
  }

  /**
   * Will look "retries" times, in case of "SQLITE_BUSY".
   * This is CPU intensive, but tests have shown this solution to be efficient
   */
  async concurentSafeWriteStatement(statement, retries) {
    for (let i = 0; i < retries; i++) {
      try {
        statement();
        return;
      } catch (error) {
        if (error.code !== 'SQLITE_BUSY') { // ignore 
          throw error;
        }
        const waitTime = i > (WAIT_LIST_MS.length - 1) ? 100 : WAIT_LIST_MS[i];
        await new Promise((r) => setTimeout(r, waitTime));
        this.logger.debug('SQLITE_BUSY, retrying in ' + waitTime + 'ms');
      }
    }
    throw new Error('Failed write action on Audit after ' + retries + ' rertries');
  }
}

function prepareEventsDeleteQuery(params) {
  if (params.streams) { throw new Error('events DELETE with stream query not supported yet: ' + JSON.stringify(params)); }
  return 'DELETE FROM events ' + prepareQuery(params, true);
}


function prepareEventsGetQuery(params) {
  return 'SELECT * FROM events_fts ' + prepareQuery(params);
}

const converters = {
  equal: (content) => { 
    const realField = (content.field === 'id') ? 'eventid' : content.field;
    if (content.value === null) return `${realField} IS NULL`;
    const value = events.coerceSelectValueForCollumn(realField, content.value);
    return `${realField} = ${value}`;
  },
  greater: (content) => { 
    const value = events.coerceSelectValueForCollumn(content.field, content.value);
    return `${content.field} > ${value}`;
  },
  greaterOrEqual: (content) => {
    const value = events.coerceSelectValueForCollumn(content.field, content.value);
    return `${content.field} >= ${value}`;
  },
  lowerOrEqual: (content) => { 
    const value = events.coerceSelectValueForCollumn(content.field, content.value);
    return `${content.field} <= ${value}`;
  },
  greaterOrEqualOrNull: (content) => { 
    const value = events.coerceSelectValueForCollumn(content.field, content.value);
    return `(${content.field} >= ${value} OR ${content.field} IS NULL)`;
  },
  typesList: (list) => { 
    if (list.length == 0) return null;
    const lt = list.map((type) => {
      const typeCorced = events.coerceSelectValueForCollumn('type', type);
      return `type = ${typeCorced}`
    });
    return '('+ lt.join(' OR ') + ')';
  },
  streamsQuery: (content) => {
    const str = toSQLiteQuery(content);
    if (str === null) return null;
    return 'streamIds MATCH \'' + str + '\'';
  }
}


function prepareQuery(params = {}, isDelete = false) {
  const ands = [];

  for (const item of params.query) {
    const newCondition = converters[item.type](item.content);
    if (newCondition != null) {
      ands.push(newCondition);
    }
  }

  let queryString = '';
  if (ands.length > 0) {
    queryString += ' WHERE ' + ands.join(' AND ') ;
  }
  
  if (! isDelete) {
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


/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const sqlite3 = require('better-sqlite3');
const eventSchemas = require('./schemas/events')
const {createFTSFor } = require('./FullTextSearchDataBase');
const events = require('./schemas/events');
const { getLogger } = require('@pryv/boiler');
const logger = getLogger('audit:user-database');
const { Readable } = require('stream');

const { toSQLiteQuery } = require('audit/src/storage/sqLiteStreamQueryUtils');

const DB_OPTIONS = {

};

const tables = {
  events: events.dbSchema
}

const WAIT_LIST_MS = [1, 2, 5, 10, 15, 20, 25, 25,  25,  50,  50, 100];

class UserDatabase {
  /**
   * sqlite3 instance
   */
  db;
  create;
  get;
  getAll;
  queryGetTerms;


  /**
   * 
   * @param {Object} params
   * @param {string} params.dbPath // the file to use as database
   */
  constructor(params) {
    const db = new sqlite3(params.dbPath, DB_OPTIONS);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 0'); // We take care of busy timeout ourselves as long as current driver does not go bellow the second
    this.create = {};
    this.getAll = {};
    this.get = {};
    

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
    createFTSFor(db, 'events', tables['events'], ['streamIds'], 'rowid');

    this.queryGetTerms = db.prepare('SELECT * FROM events_fts_v WHERE term like ?');
    
    this.db = db;
  }

  /**
   * Use only during tests or migration
   * Not safe within a multi-process environement
   */
  createEventSync(event, defaultTime) {
    const eventForDb = eventSchemas.eventToDB(event, defaultTime);
    this.create.events.run(eventForDb);
  }  

  async createEvent(event, defaultTime) {
    const eventForDb = eventSchemas.eventToDB(event, defaultTime);
    const that = this;
    await this.concurentSafeWriteStatement(() => {
      that.create.events.run(eventForDb);
    }, 10000);
  }

  getAllActions() {
    return this.queryGetTerms.all('action-%');
  }

  getAllAccesses() {
    return this.queryGetTerms.all('access-%');
  }

  getLogs(params) {
    const queryString = prepareLogQuery(params);
    
    logger.debug(queryString);
    const res = this.db.prepare(queryString).all();
    if (res != null) {
      return res.map(eventSchemas.eventFromDB);
    }
    return null;
  }

  // also see: https://nodejs.org/api/stream.html#stream_stream_readable_from_iterable_options

  getLogsStream(params, addStorePrefix) {
    const queryString = prepareLogQuery(params);
    logger.debug(queryString);

    const iterateSource = this.db.prepare(queryString).iterate();

    const iterateTransform = {
      next: function() {
        const res = iterateSource.next();
        if (res && res.value) {
          res.value = eventSchemas.eventFromDB(res.value, addStorePrefix);
        }
        return res;
      }
    };

    iterateTransform[Symbol.iterator] = function() {
      return iterateTransform;
    }

    return Readable.from(iterateTransform);
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
      }
    }
    throw new Error('Failed write action on Audit after ' + retries + ' rertries');
  }
}




function prepareTermQuery(params = {}) {
  let queryString = 'SELECT * FROM events_fts_v';
  return queryString;
}

const converters = {
  equal: (content) => { 
    if (content.field !== 'createdBy') return null; // (only supported for now)
    return `${content.field} = '${content.value}'`;
  },
  greater: (content) => { 
    return `${content.field} > ${content.value}`;
  },
  greaterOrEqual: (content) => {
    const realField = content.field === 'endTime' ? 'time' : content.field;
    return `${realField} >= ${content.value}`;
  },
  lowerOrEqual: (content) => { 
    const realField = content.field === 'endTime' ? 'time' : content.field;
    return `${realField} <= ${content.value}`;
  },
  greaterOrEqualOrNull: (content) => { 
    const realField = content.field === 'endTime' ? 'time' : content.field;
    return `(${realField} >= ${content.value} OR ${realField} IS NULL)`;
  },
  typesList: (list) => { 
    if (list.length == 0) return null;
    const lt = list.map((type) => `type = "${type}"`);
    return '('+ lt.join(' OR ') + ')';
  },
  streamsQuery: (content) => {
    const str = toSQLiteQuery(content);
    if (str === null) return null;
    return 'streamIds MATCH \'' + str + '\'';
  }
}


function prepareLogQuery(params = {}) {
  const ands = [];


  for (const item of params.query) {
    const newCondition = converters[item.type](item.content);
    if (newCondition != null) {
      ands.push(newCondition);
    }
  }
  
  let queryString = 'SELECT * FROM events_fts';

  if (ands.length > 0) {
    queryString += ' WHERE ' + ands.join(' AND ') ;
  }
  
  if (params.sortAscending) {
    queryString += ' ORDER BY time ASC';
  } else { 
    queryString += ' ORDER BY time DESC';
  }

  if (params.options?.limit) {
    queryString += ' LIMIT ' + params.options.limit;
  }
  return queryString;
}


module.exports = UserDatabase;


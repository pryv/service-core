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

  async updateEvent(eventId, event, fieldsToDelete) {
    const eventForDb = eventSchemas.eventToDB(event);
    if (fieldsToDelete != null && fieldsToDelete.length > 0) {
      fieldsToDelete.forEach(field => { eventForDb[field] = null;});
    }
    if (eventForDb.streamIds == null) { eventForDb.streamIds = '..'; }

    delete eventForDb.eventid;
    const queryString = `UPDATE events SET ${Object.keys(eventForDb).map(field => `${field} = @${field}`).join(', ')} WHERE eventid = @eventid`;
    eventForDb.eventid = eventId;
    const update = this.db.prepare(queryString);
    const res = update.run(eventForDb);
    this.logger.debug('UPDATE events changes:' + res.changes + ' eventId:' + eventId + ' event:' + JSON.stringify(eventForDb));
    if (res.changes !== 1) {
      throw new Error('Event not found');
    }
    const resultEvent = eventSchemas.eventFromDB(eventForDb);
    return resultEvent;
  }


  /**
   * Use only during tests or migration
   * Not safe within a multi-process environement
   */
  createEventSync(event, defaultTime) {
    const eventForDb = eventSchemas.eventToDB(event, defaultTime);
    this.create.events.run(eventForDb);
    this.logger.debug('(sync) CREATE event:' + JSON.stringify(eventForDb));
  }  

  async createEvent(event, defaultTime) {
    const eventForDb = eventSchemas.eventToDB(event, defaultTime);
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
    const res = this.db.prepare(queryString).run();
    this.logger.debug('(async) CREATE event: ' +queryString);
    return res;
  }

  getEvents(params) {
    const queryString = prepareEventsGetQuery(params);
    
    this.logger.debug(queryString);
    const res = this.db.prepare(queryString).all();
    if (res != null) {
      return res.map(eventSchemas.eventFromDB);
    }
    return null;
  }

  // also see: https://nodejs.org/api/stream.html#stream_stream_readable_from_iterable_options

  getEventsStream(params) {
    const queryString = prepareEventsGetQuery(params);
    this.logger.debug(queryString);

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


function prepareQuery(params = {}, forDelete = false) {
  const ands = [];
  let specialSort = null;
  const orderBy = [];

  // trashed
  switch (params.state) {
    case 'trashed':
      ands.push('trashed = 1');
      break;
    case 'all':
      break;
    default:
      ands.push('trashed = 0');
  }

  let deletedAnd = null;
  // all deletions (tests only)
  if (! params.includeDeletions) {
    deletedAnd = 'deleted IS NULL';
  }

  // onlyDeletions
  if (params.deletedSince != null) {
    deletedAnd = 'deleted > ' + params.deletedSince;
    specialSort = 'deleted';
  }

 

  
  if (params.headId) { // I don't like this !! history implementation should not be exposed .. but it's a quick fix for now
    ands.push('headId = \'' + params.headId + '\'');
  } else {
    if (! params.includeHistory) { // no history;
      ands.push('headId IS NULL');
    } else {
      if (params.id != null) { // get event and history of event
        ands.push('( eventid = \'' + params.id + '\' OR headId = \'' + params.id + '\' )');
      }
    }
  }

  // if getOne
  if (params.id != null && (params.headId == null && ! params.includeHistory)) {
    ands.push('eventid = \'' + params.id + '\'');
  }

  if (params.types != null) {
    ands.push('type IN (\'' + params.types.join('\', \'') + '\')');
  } 

  if (params.fromTime != null) {
    ands.push('time >= ' + params.fromTime);
  } 
  if (params.toTime != null) {
    ands.push('time <= ' + params.toTime);
  }

  if (params.modifiedSince != null) {
    ands.push('modified <= ' +  params.modifiedSince);
  }

  /** 
  if (params.running) {
    if (query.$or) { 
      query.$or.push({endTime: null})
    } else {
      query.endTime = null; // matches when duration exists and is null
    }
  }*/
    
  if (params.createdBy != null) {
    ands.push('createdBy = \'' + params.createdBy + '\'');
  }

  if (params.streams != null) {
    const str = toSQLiteQuery(params.streams);
    if (str) ands.push('streamIds MATCH \'' + str + '\'');
  }

  // excludes. (only supported for ID.. specific to one updateEvent in SystemsStream .. might be removed)
  if (params.NOT != null) {
    if (params.NOT.id != null) {
      if (params.id != null) throw new Error('NOT.id is not supported with id');
      ands.push('eventid != \'' + params.NOT.id + '\'');
    }
  }


  let queryString = '';

  if (ands.length > 0) {
    queryString += ' WHERE ' + ands.join(' AND ') ;
  }
  
  if (!forDelete) {

    const orderBy = specialSort || ' time ';
    if (params.sortAscending) {
      queryString += ' ORDER BY ' + orderBy + ' ASC';
    } else { 
      queryString += ' ORDER BY '  + orderBy + ' DESC';
    }

    if (params.includeHistory) {
      queryString += ', modified ASC'
    }

    if (params.limit) {
      queryString += ' LIMIT ' + params.limit;
    }
  }

 

  //console.log(params, queryString);
  return queryString;
}


module.exports = UserDatabase;


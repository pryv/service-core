/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const sqlite3 = require('better-sqlite3');
const eventSchemas = require('./schemas/events')
const {createFTSFor } = require('./FullTextSearchDataBase');
const events = require('./schemas/events');
const { getLogger } = require('@pryv/boiler');
const logger = getLogger('audit:user-database');

const DB_OPTIONS = {

};

const tables = {
  events: events.dbSchema
}

class UserDatabase {
  /**
   * sqlite3 instance
   */
  db;
  create;
  get;
  getAll;


  /**
   * 
   * @param {Object} params
   * @param {string} params.dbPath // the file to use as database
   */
  constructor(params) {
    const db = new sqlite3(params.dbPath, DB_OPTIONS);
    db.pragma('journal_mode = WAL');
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
    
    this.db = db;
  }

  createEvent(event, defaulTime) {
    const eventForDb = eventSchemas.eventToDB(event, defaulTime);
    this.create.events.run(eventForDb);
  }

  getLogs(params) {
    
    const ands = [];

    if (params !== null) {
      if (params.fromTime == null && params.toTime != null) {
        params.fromTime = params.toTime - (24 * 60 * 60); // 24 hours before
        params.limit = 0;
      }
      if (params.fromTime != null && params.toTime == null) {
        params.toTime = Date.now() / 1000;
        params.limit = 0;
      }
      if (params.fromTime == null && params.toTime == null && params.limit == null) {
        // limit to 20 items by default
        params.limit = 20;
      }
      if (params.fromTime != null) {
        ands.push('time >= ' + params.fromTime);
        ands.push('time <= ' + params.toTime);
      }
      
      if (params.createdBy != null) {
        ands.push('createdBy = \'' + params.createdBy + '\'');
      }
    } 
    
    if (params.limit == null) {
      params.limit = 20;
    }
    if (params.sortAscending == null) {
      params.sortAscending = false;
    }
    
    let queryString = 'SELECT * FROM events';

    if (ands.length > 0) {
      queryString += ' WHERE ' + ands.join(' AND ');
    }

    if (params.limit > 0) {
      //queryString += ' LIMIT ' + params.limit;
    }
    
    if (params.sortAscending) {
      queryString += ' ORDER BY time ASC';
    } else { 
      queryString += ' ORDER BY time DESC';
    }
    logger.debug(queryString);
    const res = this.db.prepare(queryString).all().map(convertFromDB);
    if (res != null) {
      return res.map(eventSchemas.eventFromDB);
    }
    return null;
  }

  close() { 
    this.db.close();
  }
}

function convertFromDB(result) {
  if (result == null) {
    return null;
  }
  return result;
}

module.exports = UserDatabase;


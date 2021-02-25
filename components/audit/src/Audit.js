/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


const path = require('path');
const _ = require('lodash');

const { getStorage, closeStorage } = require('./storage');
const { getSyslog } = require('./syslog');

const { getConfig, getLogger} = require('@pryv/boiler');
const logger = getLogger('audit');

// for an unkown reason removing ".js" returns an empty object
const validation = require('./validation.js');

/**
 * EventEmitter interface is just for tests syncing for now
 */
class Audit {
  _storage;
  _syslog;

  constructor() {
    logger.debug('Start');
  }

  get storage() {
    return this._storage;
  }

  get syslog() {
    return this._syslog;
  }

  async init() {
    logger.debug('Init');
    const config = await getConfig();

    if (config.get('audit:storage:active')) {
      this._storage = await getStorage();
    }

    if (config.get('audit:syslog:active')) {
      this._syslog = await getSyslog();
    }

    logger.info('Application started');
  }

  async eventForUser(userId, event) {
    logger.debug('eventForUser: ' + userId + ' ' + logger.inspect(event));
    const valid = validation.eventForUser(userId, event);
    if ( valid !== true) {
      throw new Error('Invalid audit eventForUser call : ' + valid, {userId: userId, event: event}); 
    }

    if (this.syslog)
      this.syslog.eventForUser(userId, event);
    
    if (this.storage) 
      this.storage.forUser(userId).createEvent(event); 
  }

  async apiCall(id, context, params, err, result) {
    
    if (context.skipAudit) return; // some calls .. 'system.getUsersPoolSize'

    const userId = context.user?.id;
    //console.log(context.access);
   
    let event = {
      createdBy: 'system',
      type: 'log/user-api',
      content: {
        source: context.source,
        action: id,
        status: 200
      },
    }

    if (err) {
      // ensure that we have access to everything we need here

      event = _.extend(event, {
        streamIds: [context.access?.id],
        content: {
          query: params,
          status: 400,
          error: {
            id: err.id,
            message: err.message,
            data: err.data,
          }
        }
      });
    } else {
      if (! context.access?.id || ! userId || ! context.source || ! context.source.ip ) {
        console.log('XXX E> ApiCall', id, ' UserId', userId, ' accesId:', context.access?.id, ' source:', context.source);
        const e = new Error();
        const stack = e.stack.split('\n').filter(l => l.indexOf('node_modules') <0 );
        console.log(stack);
        console.log('XXXX> Access:', context.access);
        //throw Error();
      }
      
      event = _.extend(event, {
        streamIds: [context.access?.id],
        //query: params,
      });
      //console.log('XXX> ApiCall', id, ' UserId', userId, ' accesId:', context.access?.id, ' source:', context.source);
    }
    this.eventForUser(userId, event);
  }

  close() {
    closeStorage();
  }
}

module.exports = Audit;

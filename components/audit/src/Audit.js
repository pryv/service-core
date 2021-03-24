/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


const _ = require('lodash');

const { getStorage, closeStorage } = require('./storage');
const { getSyslog } = require('./syslog');

const { getConfig, getLogger} = require('@pryv/boiler');
const logger = getLogger('audit');

// for an unkown reason removing ".js" returns an empty object
const validation = require('./validation');
const { WITHOUT_USER_METHODS_MAP } = require('./ApiMethods');
const AuditFilter = require('./AuditFilter');

/**
 * EventEmitter interface is just for tests syncing for now
 */
class Audit {
  _storage;
  _syslog;
  filter;

  /**
   * Requires to call async init() to use
   */
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
    logger.debug('Audit initiating...');
    const config = await getConfig();
    this._storage = await getStorage();
    this._syslog = await getSyslog();

    this.filter = new AuditFilter({
      syslogFilter: config.get('audit:syslog:filter'),
      storageFilter: config.get('audit:storage:filter'),
    });
    logger.info('Audit started');
  }

  async validApiCall(context, params, result) {
    const methodId = context.methodId;
    if (! this.filter.isAudited(methodId)) return;

    const userId = context?.user?.id;
    const event = buildDefaultEvent(context, params);
    this.eventForUser(userId, event, methodId);
  }

  async errorApiCall(context, params, error) {
    const methodId = context.methodId;
    if (! this.filter.isAudited(methodId)) return;
    const userId = context?.user?.id;
  
    if (context.access?.id == null) {
      context.access = { id: error.id };
    }
    const event = buildDefaultEvent(context, params);

    event.content.error = {
      id: error.id,
      message: error.message,
      data: error.data,
    };

    this.eventForUser(userId, event, methodId);
  }

  async eventForUser(userId, event) {
    logger.debug('eventForUser: ' + userId + ' ' + logger.inspect(event));

    const methodId = event.content.action;

    // replace this with api-server's validation or remove completely as we are prpoducing it in house.
    let isValid = false;
    if (WITHOUT_USER_METHODS_MAP[methodId]) {
      isValid = validation.eventWithoutUser(userId, event);
    } else {
      isValid = validation.eventForUser(userId, event);
    }
    if (! isValid) {
      throw new Error('Invalid audit eventForUser call : ' + isValid, {userId: userId, event: event}); 
    }

    const isAudited = this.filter.isAudited(methodId);

    if (this.syslog && isAudited.syslog) {
      this.syslog.eventForUser(userId, event);
    }
    if (this.storage && isAudited.storage) {
      this.storage.forUser(userId).createEvent(event);
    }
  }

  async reloadConfig() {
    await this.init();
  }

  close() {
    closeStorage();
  }
}

module.exports = Audit;

function buildDefaultEvent(context, params) {
  return {
    createdBy: 'system',
    streamIds: [context.access.id],
    type: 'log/user-api',
    content: {
      source: context.source,
      action: context.methodId,
      status: 200,
      query: params,
    },
  }
}

function log(context, userId, validity, id) {
  const methodId = context.methodId;
  if ( 
    context.access?.id == null || 
    methodId == null ||
    userId == null
  ) {
    console.log('XXX E> ApiCall', methodId, ' UserId', userId, ' accesId:', context.access?.id, 'Audited?', AUDITED_METHODS_MAP[methodId], 'XX' + validity, id);
    //const e = new Error();
    //const stack = e.stack.split('\n').filter(l => l.indexOf('node_modules') <0 );
    //console.log(stack);
    //console.log('XXXX> Access:', context.access);
  }
}
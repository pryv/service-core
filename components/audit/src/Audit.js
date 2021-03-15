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
const { AUDITED_METHODS_MAP, WITHOUT_USER_METHODS_MAP } = require('./ApiMethods');


/**
 * EventEmitter interface is just for tests syncing for now
 */
class Audit {
  _storage;
  _syslog;
  _filter;

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

  get filter() {
    return this._filter;
  }

  async init() {
    logger.debug('Audit initiating...');
    const config = await getConfig();

    if (config.get('audit:storage:active')) {
      this._storage = await getStorage();
    }

    if (config.get('audit:syslog:active')) {
      this._syslog = await getSyslog();
    }

    initFilter(this, config);
    logger.info('Audit started');
  }

  async errorApiCall(context, params, error) {
    const methodId = context.methodId;
    if (! AUDITED_METHODS_MAP[methodId]) return;
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

  async validApiCall(context, params, result) {
    const methodId = context.methodId;
    if (! AUDITED_METHODS_MAP[methodId]) return;

    const userId = context?.user?.id;
    const event = buildDefaultEvent(context, params);
    this.eventForUser(userId, event, methodId);
  }

  async eventForUser(userId, event, methodId) {
    logger.debug('eventForUser: ' + userId + ' ' + logger.inspect(event));

    // replace this with api-server's validation
    let isValid = false;
    if (WITHOUT_USER_METHODS_MAP[methodId]) {
      isValid = validation.eventWithoutUser(userId, event);
    } else {
      isValid = validation.eventForUser(userId, event);
    }

    if (! isValid) {
      throw new Error('Invalid audit eventForUser call : ' + isValid, {userId: userId, event: event}); 
    }

    if (this.syslog && isPartOfSyslog(methodId)) {
      this.syslog.eventForUser(userId, event);
    }
    
    if (this.storage && isPartOfStorage(methodId)) {
      this.storage.forUser(userId).createEvent(event);
    }

    function isPartOfSyslog(methodId) {
      //if (! this.filter.syslog.methods[methodId]) return false;
      return true;
    }
    function isPartOfStorage(methodId) {
      if (WITHOUT_USER_METHODS_MAP[methodId]) return false;
      //if (! this.filter.storage.methods[methodId]) return false;
      return true;
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

function initFilter(audit, config) {
  const syslogFilter = config.get('audit:syslog:filter');
  const storageFilter = config.get('audit:storage:filter');
  validation.filter(syslogFilter);
  validation.filter(storageFilter);

  this.filter = {
    syslog: {
      methods: buildMap(syslogFilter.methods.allowed),
    },
    storage: {
      methods: buildMap(storageFilter.methods.allowed),
    },
  };

  function buildAllowed(allowed, unallowed) {
    if (allowed.length === 0) return true;
  }
}

/**
 * Builds a map with an { i => true } entry for each array element
 * @param {Array<*>} array 
 */
function buildMap(array) {
  const map = {};
  array.forEach(i => {
    map[i] = true;
  });
  return map;
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
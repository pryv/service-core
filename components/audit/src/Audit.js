/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */


const _ = require('lodash');

const { getStorage, closeStorage } = require('./storage');
const { getSyslog } = require('./syslog');

const { getConfig, getLogger} = require('@pryv/boiler');
const logger = getLogger('audit');

const CONSTANTS = require('./Constants');
const validation = require('./validation');
const { WITHOUT_USER_METHODS_MAP } = require('./ApiMethods');
const AuditFilter = require('./AuditFilter');
const { AuditAccessIds } = require('./MethodContextUtils');
const util = require('util');

/**
 * EventEmitter interface is just for tests syncing for now
 */
class Audit {
  _storage;
  _syslog;
  filter;
  tracer: {};

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

  async validApiCall(context, result) {
    const methodId = context.methodId;
    if (! this.filter.isAudited(methodId)) return;

    context.tracing.startSpan('audit.validApiCall');

    const userId = context?.user?.id;
    const event = buildDefaultEvent(context);
    if (context.auditIntegrityPayload != null) {
      event.content.record = context.auditIntegrityPayload; 
    }
    event.type = CONSTANTS.EVENT_TYPE_VALID;
    await this.eventForUser(userId, event, methodId);
    
    context.tracing.finishSpan('audit.validApiCall');
  }

  async errorApiCall(context, error) {
    const methodId = context.methodId;
    if (! this.filter.isAudited(methodId)) return;

    context.tracing.startSpan('audit.errorApiCall');

    const userId = context?.user?.id;
  
    if (context.access?.id == null) {
      context.access = { id: AuditAccessIds.INVALID };
    }
    const event = buildDefaultEvent(context);
    event.type = CONSTANTS.EVENT_TYPE_ERROR;
    event.content.id = error.id;
    event.content.message = error.message;

    await this.eventForUser(userId, event, methodId);
    context.tracing.finishSpan('audit.errorApiCall');
  }

  async eventForUser(userId, event) {
    logger.debug('eventForUser: ' + userId + ' ' + util.inspect(event, {breakLength: Infinity, colors: true}));

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
      const userStorage = await this.storage.forUser(userId);
      await userStorage.createEvent(event);
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

function buildDefaultEvent(context) {
  const time = Date.now() / 1000;
  const event = {
    createdBy: 'system',
    streamIds: [CONSTANTS.ACCESS_STREAM_ID_PREFIX + context.access.id, CONSTANTS.ACTION_STREAM_ID_PREFIX + context.methodId],
    time: time,
    endTime: time,
    content: {
      source: context.source,
      action: context.methodId,
      query: context.originalQuery,
    },
  }
  if (context.callerId != null) {
    event.content.callerId = context.callerId;
  }
  return event;
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
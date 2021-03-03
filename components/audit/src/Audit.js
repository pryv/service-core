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

const METHODS_WITHOUT_USER = [
  'auth.register',
  'auth.usernameCheck',
  'auth.emailCheck',
  'service.info',
  'profile.getPublic',
];

const METHODS_WITHOUT_ACCESS = [
  'auth.login',
  'account.resetPassword',
];

/**
 * EventEmitter interface is just for tests syncing for now
 */
class Audit {
  _storage;
  _syslog;

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

  async apiCall(actionId, context, params, err, result) {
    
    if (context.skipAudit) return; // some calls .. 'system.getUsersPoolSize'

    const userId = context.user?.id;

    let event = {
      createdBy: 'system',
      type: 'log/user-api',
      content: {
        source: context.source,
        action: actionId,
        status: 200,
        query: params,
      },
    }

    if (err) {
      // ensure that we have access to everything we need here
      event = _.extend(event, {
        content: {
          status: 400,
          error: {
            id: err.id,
            message: err.message,
            data: err.data,
          }
        }
      });
    } else {
      if ( context.access?.id == null || context.source == null || context.source.ip == null ) {
        console.log('XXX E> ApiCall', actionId, ' UserId', userId, ' accesId:', context.access?.id, ' source:', context.source);
        const e = new Error();
        const stack = e.stack.split('\n').filter(l => l.indexOf('node_modules') <0 );
        console.log(stack);
        console.log('XXXX> Access:', context.access);
        //throw Error();
      }
      //console.log('XXX> ApiCall', actionId, ' UserId', userId, ' accesId:', context.access?.id, ' source:', context.source);
    }

    if (hasUser(actionId)) {
      // exception: auth.delete
      if (maybeNoUser(actionId)) {
        event.streamIds = context?.access?.id ? [context.access.id] : ['system'];
      } else if (hasAccess(actionId)) {
        if (context.access != null) {
          event.streamIds = [context.access.id];
        } else {
          console.log('got', err.id)
          event.streamIds = ['invalid-access-token'];
        }
      } else {
        event.streamIds = ['auth.login'];
      }
      this.eventForUser(userId, event);
    } else {
      event.streamIds = ['noAuth']
      this.eventForUser('noUser', event);
    }
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

  close() {
    closeStorage();
  }
}

module.exports = Audit;


/**
 * See if the action should expect a userId.
 */
function hasUser(actionId) {
  return ! METHODS_WITHOUT_USER.includes(actionId);
}

/**
 * 
 */
function maybeNoUser(actionId) {
  return actionId === 'auth.delete';
}

/**
 * See if the action should expect an accessId
 */
function hasAccess(actionId) {
  return hasUser(actionId) && ! METHODS_WITHOUT_ACCESS.includes(actionId);
}

function getAllActions() {
  return [
    'getAccessInfo',
    'callBatch',
    'auth.login',
    'auth.logout',
    //'auth.register',
    //'auth.usernameCheck',
    //'auth.emailCheck',
    'auth.delete',
    'accesses.get',
    'accesses.create',
    'accesses.update',
    'accesses.delete',
    'accesses.checkApp',
    //'service.info',
    'webhooks.get',
    'webhooks.getOne',
    'webhooks.create',
    'webhooks.update',
    'webhooks.delete',
    'webhooks.test',
    'account.get',
    'account.update',
    'account.changePassword',
    'account.requestPasswordReset',
    //'account.resetPassword',
    'followedSlices.get',
    'followedSlices.create',
    'followedSlices.update',
    'followedSlices.delete',
    //'profile.getPublic',
    'profile.getApp',
    'profile.get',
    'profile.updateApp',
    'profile.update',
    'streams.get',
    'streams.create',
    'streams.update',
    'streams.delete',
    'events.get',
    'events.getOne',
    'events.create',
    'events.update',
    'events.delete',
    'events.deleteAttachment'
  ];
}
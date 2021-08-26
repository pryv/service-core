/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const errorHandling = require('errors').errorHandling;
const errors = require('errors').factory;
const string = require('./helpers/string');
const timestamp = require('unix-timestamp');
const { getLogger } = require('@pryv/boiler');
const { getStorageLayer } = require('storage');

import type API  from '../API';
import type { StorageLayer } from 'storage';
import type { MethodContext } from 'business';
import type Result  from '../Result';
import type { ApiCallback }  from '../API';

/**
 * Call tracking functions, to be registered after all methods have been registered.
 *
 * @param api
 */
module.exports = async function (api: API) 
{
  const logger = getLogger('methods:trackingFunctions');
  const storageLayer = await getStorageLayer();
  const userAccessesStorage = storageLayer.accesses;

  api.register('*',
    updateAccessUsageStats);

  function updateAccessUsageStats(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    // don't make callers wait on this to get their reply
    next();

    // handle own errors not to mess with "concurrent" code (because of next() above)
    try {
      const access = context?.access;
      if (access) {
        const calledMethodKey = string.toMongoKey(context.methodId);
        const prevCallCount = (access.calls && access.calls[calledMethodKey]) ?
          access.calls[calledMethodKey] : 
          0;

        const update = { lastUsed: timestamp.now() };
        update['calls.' + calledMethodKey] = prevCallCount + 1;

        userAccessesStorage.updateOne(context.user, {id: context.access.id}, update, function (err) {
          if (err) {
            errorHandling.logError(errors.unexpectedError(err), {
              url: context.user.username,
              method: 'updateAccessLastUsed',
              body: params
            }, logger);
          }
        });
      }
    } catch (err) {
      errorHandling.logError(errors.unexpectedError(err), {
        url: context?.user?.username,
        method: 'updateAccessLastUsed',
        body: params
      }, logger);
    }
  }

};

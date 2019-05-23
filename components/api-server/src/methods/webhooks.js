// @flow

const _ = require('lodash');

const APIError = require('components/errors').APIError;
const errors = require('components/errors').factory;
const ErrorIds = require('components/errors').ErrorIds;

const commonFns = require('./helpers/commonFunctions');
const webhookSchema = require('../schema/webhook');
const methodsSchema = require('../schema/webhooksMethods');

const Webhook = require('components/business').webhooks.Webhook;
const WebhooksRepository = require('components/business').webhooks.Repository;

import type { StorageLayer } from 'components/storage';
import type { Logger } from 'components/utils';
import type { MethodContext } from 'components/model';

import type API from '../API';
import type { ApiCallback } from '../API';
import type Result from '../Result';

export type WebhooksSettingsHolder = {
  minIntervalMs: number,
  maxRetries: number,
}

module.exports = function produceAccessesApiMethods(
  api: API,
  logger: Logger,
  wehbooksSettings: WebhooksSettingsHolder,
  storageLayer: StorageLayer) {

  const webhooksRepository = new WebhooksRepository(storageLayer.webhooks);

  // COMMON

  api.register('webhooks.*',
    commonFns.loadAccess(storageLayer)
  );

  // RETRIEVAL

  api.register('webhooks.get',
    commonFns.getParamsValidation(methodsSchema.get.params),
    findAccessibleWebhooks,
  );

  async function findAccessibleWebhooks(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const currentAccess = context.access;

    if (currentAccess == null) {
      return next(new Error('AF: Access cannot be null at this point.'));
    }

    if (currentAccess.isShared()) {
      return next(errors.forbidden(
        'Shared Accesses cannot create Webhooks. Please use an App Access'
      ));
    }

    try {
      const webhooks = await webhooksRepository.get(context.user, currentAccess);
      result.webhooks = webhooks;
    } catch (error) {
      //return next(errors.unexpectedError);
    }

    next();
  }

  // CREATION

  api.register('webhooks.create',
    commonFns.getParamsValidation(methodsSchema.create.params),
    applyPrerequisitesForCreation,
    createWebhook);

  function applyPrerequisitesForCreation(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const currentAccess = context.access;
    if (currentAccess.isPersonal()) {
      return next(errors.forbidden(
        'Personal Accesses cannot create Webhooks. Please use an App Access'
      ));
    }
    if (currentAccess.isShared()) {
      return next(errors.forbidden(
        'Shared Accesses cannot create Webhooks. Please use an App Access'
      ));
    }

    context.initTrackingProperties(params);
    
    return next();
  }

  async function createWebhook(context: MethodContext, params: any, result: Result, next: ApiCallback) {

    const webhookParams = _.cloneDeep(params);

    const webhook = new Webhook (_.extend(webhookParams, {
      accessId: context.access.id,
      webhooksStorage: storageLayer.webhooks,
    }));

    try {
      await webhook.save(context.user);
      result.webhook = webhook.forApi();
    } catch (error) {
      // Expecting a duplicate error
      if (error.isDuplicateIndex('url')) {
        return next(errors.itemAlreadyExists('webhook',
          { url: params.url }));
      }
      return next(errors.unexpectedError(error));
    }

    return next();
  }

};
module.exports.injectDependencies = true;

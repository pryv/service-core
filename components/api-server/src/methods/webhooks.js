// @flow

const _ = require('lodash');
const timestamp = require('unix-timestamp');

const APIError = require('components/errors').APIError;
const errors = require('components/errors').factory;
const ErrorIds = require('components/errors').ErrorIds;

const commonFns = require('./helpers/commonFunctions');
const methodsSchema = require('../schema/webhooksMethods');

const Webhook = require('components/business').webhooks.Webhook;
const WebhooksRepository = require('components/business').webhooks.Repository;

const NatsPublisher = require('../socket-io/nats_publisher');
const NATS_CONNECTION_URI = require('components/utils').messaging.NATS_CONNECTION_URI;
const NATS_WEBHOOKS_CREATE_CHANNEL = require('components/utils').messaging.NATS_WEBHOOKS_CREATE;
const NATS_WEBHOOKS_DELETE_CHANNEL = require('components/utils').messaging.NATS_WEBHOOKS_DELETE;

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
  const natsPublisher = new NatsPublisher(NATS_CONNECTION_URI);

  // RETRIEVAL

  api.register('webhooks.get',
    commonFns.getParamsValidation(methodsSchema.get.params),
    forbidSharedAccess,
    findAccessibleWebhooks,
  );

  function forbidSharedAccess(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const currentAccess = context.access;

    if (currentAccess == null) {
      return next(new Error('AF: Access cannot be null at this point.'));
    }
    if (currentAccess.isShared()) {
      return next(errors.forbidden(
        'Shared Accesses cannot manipulate Webhooks. Please use an App or Personnal Access.'
      ));
    }
    next();
  }

  async function findAccessibleWebhooks(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const currentAccess = context.access;
    try {
      const webhooks = await webhooksRepository.get(context.user, currentAccess);
      result.webhooks = webhooks;
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

  api.register('webhooks.getOne',
    commonFns.getParamsValidation(methodsSchema.get.params),
    forbidSharedAccess,
    findWebhook,
  );

  async function findWebhook(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const user = context.user;
    const currentAccess = context.access;
    const webhookId = params.id;
    try {
      const webhook = await webhooksRepository.getById(user, webhookId);

      if (webhook == null) {
        return next(errors.unknownResource('webhook', params.id));
      }
      if (!isWebhookInScope(webhook, currentAccess)) {
        return next(errors.forbidden());
      }

      result.webhook = webhook.forApi();
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();
  }

  // CREATION

  api.register('webhooks.create',
    commonFns.getParamsValidation(methodsSchema.create.params),
    forbidSharedAccess,
    forbidPersonalAccess,
    createWebhook,
    loadWebhook,
  );

  function forbidPersonalAccess(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const currentAccess = context.access;

    if (currentAccess == null) {
      return next(new Error('AF: Access cannot be null at this point.'));
    }
    if (currentAccess.isPersonal()) {
      return next(errors.forbidden(
        'Personal Accesses cannot create Webhooks. Please use an App Access.'
      ));
    }
    next();
  }

  async function createWebhook(context: MethodContext, params: any, result: Result, next: ApiCallback) {
    context.initTrackingProperties(params);

    const webhook = new Webhook(_.extend({
      user: context.user,
      accessId: context.access.id,
      webhooksStorage: storageLayer.webhooks,
    }, params));

    try {
      await webhook.save();
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

  async function loadWebhook(context: MethodContext, params: any, result: Result, next: ApiCallback) {
    natsPublisher.deliver(NATS_WEBHOOKS_CREATE_CHANNEL, _.extend(
      { username: context.user.username }, 
      { webhook: result.webhook })
    );
    return next();
  }

  // UPDATE

  api.register('webhooks.update',
    commonFns.getParamsValidation(methodsSchema.update.params),
    forbidSharedAccess,
    applyPrerequisitesForUpdate,
    updateWebhook);

  function applyPrerequisitesForUpdate(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    context.updateTrackingProperties(params.update);
    next();
  }

  async function updateWebhook(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const user = context.user;
    const currentAccess = context.access;
    const update = params.update;
    const webhookId = params.id;

    try {
      const webhook = await webhooksRepository.getById(user, webhookId);
      if (webhook == null) {
        return next(errors.unknownResource('webhook', params.id));
      }
      if (!isWebhookInScope(webhook, currentAccess)) {
        return next(errors.forbidden());
      }

      await webhook.update(update);
      result.webhook = webhook.forApi();
    } catch (e) {
      return next(errors.unexpectedError(e));
    }
    next();
  }

  // DELETION

  api.register('webhooks.delete',
    commonFns.getParamsValidation(methodsSchema.del.params),
    forbidSharedAccess,
    deleteAccess,
    turnOffWebhook,
  );

  async function deleteAccess(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const user = context.user;
    const currentAccess = context.access;
    const webhookId = params.id;

    try {
      const webhook = await webhooksRepository.getById(user, webhookId);
      if (webhook == null) {
        return next(errors.unknownResource('webhook', params.id));
      }
      if (!isWebhookInScope(webhook, currentAccess)) {
        return next(errors.forbidden());
      }

      await webhook.delete();
      result.webhookDeletion = {
        id: webhook.id,
        deleted: timestamp.now(),
      };
    } catch (e) {
      return next(errors.unexpectedError(e));
    }
    next();
  }

  async function turnOffWebhook(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const username = context.user.username;
    const webhookId = params.id;
    natsPublisher.deliver(NATS_WEBHOOKS_DELETE_CHANNEL, {
      username: username,
      webhook: {
        id: webhookId,
      }
    });
    return next();
  }


  // TEST

  api.register('webhooks.test',
    commonFns.getParamsValidation(methodsSchema.test.params),
    forbidSharedAccess,
    testWebhook,
  );

  async function testWebhook(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const user = context.user;
    const currentAccess = context.access;
    const webhookId = params.id;
    let webhook;
    try {
      webhook = await webhooksRepository.getById(user, webhookId);
      if (webhook == null) {
        return next(errors.unknownResource('webhook', params.id));
      }
      if (!isWebhookInScope(webhook, currentAccess)) {
        return next(errors.forbidden());
      }

      // replies after having made the call, but returns unexpected error if call fails - as if db fetching fails
      // await webhook.makeCall(['test']);
      result.webhook = webhook.forApi();
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    if (webhook != null) webhook.makeCall(['test']);
    next();
  }

  /**
   * checks if the webhook is allowed to be handled by the access
   * If Personnal: yes
   * If App: only if it was used to create the webhook
   */
  function isWebhookInScope(webhook: {}, access: {}): boolean {
    if (access.isPersonal()) return true;
    return access.isApp() && (access.id === webhook.accessId);
  }


};
module.exports.injectDependencies = true;

/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const _ = require('lodash');
const timestamp = require('unix-timestamp');

const errors = require('errors').factory;

const commonFns = require('./helpers/commonFunctions');
const webhookSchema = require('../schema/webhook');
const methodsSchema = require('../schema/webhooksMethods');

const Webhook = require('business').webhooks.Webhook;
const WebhooksRepository = require('business').webhooks.Repository;

const NatsPublisher = require('../socket-io/nats_publisher');
const NATS_CONNECTION_URI = require('utils').messaging.NATS_CONNECTION_URI;
const NATS_WEBHOOKS_CREATE_CHANNEL = require('utils').messaging.NATS_WEBHOOKS_CREATE;
const NATS_WEBHOOKS_ACTIVATE_CHANNEL = require('utils').messaging.NATS_WEBHOOKS_ACTIVATE;
const NATS_WEBHOOKS_DELETE_CHANNEL = require('utils').messaging.NATS_WEBHOOKS_DELETE;

import type { StorageLayer } from 'storage';
import type { MethodContext } from 'model';

import type API  from '../API';
import type { ApiCallback }  from '../API';
import type Result  from '../Result';

import type { WebhookUpdate } from 'business/src/webhooks/Webhook';

export type WebhooksSettingsHolder = {
  minIntervalMs: number,
  maxRetries: number,
  runsSize: number,
};

type Access = {
  id: string,
  isApp(): boolean,
  isPersonal(): boolean,
};

module.exports = function produceWebhooksApiMethods(
  api: API,
  logger,
  wehbooksSettings: WebhooksSettingsHolder,
  storageLayer: StorageLayer) {

  const webhooksRepository: WebhooksRepository = new WebhooksRepository(storageLayer.webhooks);
  const natsPublisher: NatsPublisher = new NatsPublisher(NATS_CONNECTION_URI);

  // RETRIEVAL

  api.register('webhooks.get',
    commonFns.getParamsValidation(methodsSchema.get.params),
    findAccessibleWebhooks,
  );

  async function findAccessibleWebhooks(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const currentAccess = context.access;
    try {
      const webhooks: Array<Webhook> = await webhooksRepository.get(context.user, currentAccess);
      result.webhooks = webhooks.map(forApi);
    } catch (error) {
      return next(errors.unexpectedError(error));
    }
    next();

    function forApi(webhook: Webhook): {} {
      return webhook.forApi();
    }
  }

  api.register('webhooks.getOne',
    commonFns.getParamsValidation(methodsSchema.get.params),
    findWebhook,
  );

  async function findWebhook(context: MethodContext, params: { id: string }, result: Result, next: ApiCallback) {
    const user: {} = context.user;
    const currentAccess: Access = context.access;
    const webhookId: string = params.id;
    try {
      const webhook: Webhook = await webhooksRepository.getById(user, webhookId);

      if (webhook == null) {
        return next(errors.unknownResource('webhook', params.id));
      }
      if (!isWebhookInScope(webhook, currentAccess)) {
        return next(errors.forbidden('The webhook was not created by this access.'));
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
    forbidPersonalAccess,
    createWebhook,
    bootWebhook,
  );

  function forbidPersonalAccess(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const currentAccess: Access = context.access;

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
      webhooksRepository: webhooksRepository,
      runsSize: wehbooksSettings.runsSize,
      minIntervalMs: wehbooksSettings.minIntervalMs,
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

  async function bootWebhook(context: MethodContext, params: any, result: Result, next: ApiCallback) {
    natsPublisher.deliver(NATS_WEBHOOKS_CREATE_CHANNEL, _.extend(
      { username: context.user.username }, 
      { webhook: result.webhook })
    );
    return next();
  }

  // UPDATE

  api.register('webhooks.update',
    commonFns.getParamsValidation(methodsSchema.update.params),
    commonFns.catchForbiddenUpdate(webhookSchema('update'), false, logger),
    applyPrerequisitesForUpdate,
    updateWebhook,
    reactivateWebhook,
  );

  function applyPrerequisitesForUpdate(context: MethodContext, 
    params: { update: {} }, 
    result: Result, next: ApiCallback) {
    context.updateTrackingProperties(params.update);
    next();
  }

  async function updateWebhook(context: MethodContext, 
    params: { update: {}, id: string }, 
    result: Result, next: ApiCallback) {
    
    const user: {} = context.user;
    const currentAccess: Access = context.access;
    const update: WebhookUpdate = params.update;
    const webhookId: string = params.id;

    if (update.state === 'active') {
      update.currentRetries = 0;
    }

    try {
      const webhook: Webhook = await webhooksRepository.getById(user, webhookId);
      if (webhook == null) {
        return next(errors.unknownResource('webhook', params.id));
      }
      if (!isWebhookInScope(webhook, currentAccess)) {
        return next(errors.forbidden('The webhook was not created by this app access.'));
      }

      await webhook.update(update);
      result.webhook = webhook.forApi();
    } catch (e) {
      return next(errors.unexpectedError(e));
    }
    next();
  }

  async function reactivateWebhook(context: MethodContext, params: any, result: Result, next: ApiCallback) {
    natsPublisher.deliver(NATS_WEBHOOKS_ACTIVATE_CHANNEL, _.extend(
      { username: context.user.username }, 
      { webhook: result.webhook })
    );
    return next();
  }

  // DELETION

  api.register('webhooks.delete',
    commonFns.getParamsValidation(methodsSchema.del.params),
    deleteAccess,
    turnOffWebhook,
  );

  async function deleteAccess(context: MethodContext, 
    params: { id: string }, 
    result: Result, next: ApiCallback) {
    
    const user: {} = context.user;
    const currentAccess: Access = context.access;
    const webhookId: string = params.id;

    try {
      const webhook: Webhook = await webhooksRepository.getById(user, webhookId);
      if (webhook == null) {
        return next(errors.unknownResource('webhook', params.id));
      }
      if (!isWebhookInScope(webhook, currentAccess)) {
        return next(errors.forbidden('The webhook was not created by this app access.'));
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

  async function turnOffWebhook(context: MethodContext, params: { id: string }, result: Result, next: ApiCallback) {
    const username: string = context.user.username;
    const webhookId: string = params.id;
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
    testWebhook,
  );

  async function testWebhook(context: MethodContext, params: { id: string }, result: Result, next: ApiCallback) {

    const TEST_MESSAGE: string = 'test';

    const user: {} = context.user;
    const currentAccess: Access = context.access;
    const webhookId: string = params.id;
    let webhook: ?Webhook;
    try {
      webhook = await webhooksRepository.getById(user, webhookId);
      if (webhook == null) {
        return next(errors.unknownResource('webhook', params.id));
      }
      if (!isWebhookInScope(webhook, currentAccess)) {
        return next(errors.forbidden('The webhook was not created by this app access.'));
      }
    } catch (error) {
      return next(errors.unexpectedError(error));
    }

    try {
      await webhook.makeCall([TEST_MESSAGE]);
    } catch (e) {
      return next(errors.unknownReferencedResource('webhook', 'url', webhook.url, e));
    }
    result.webhook = webhook.forApi();
    next();
  }

  /**
   * checks if the webhook is allowed to be handled by the access
   * If Personnal: yes
   * If App: only if it was used to create the webhook
   */
  function isWebhookInScope(webhook: Webhook, access: Access): boolean {
    if (access.isPersonal()) return true;
    return access.id === webhook.accessId;
  }
  
};

/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const _ = require('lodash');

const Webhook = require('./Webhook');
const WebhooksStorage = require('storage').StorageLayer.webhooks;
const UserEventsStorage = require('storage').StorageLayer.events;
const { getUsersRepository } = require('business/src/users');

/** 
 * Repository of all Webhooks in this Pryv.io instance. 
 */
class Repository {
  storage: WebhooksStorage;
  userEventsStorage: UserEventsStorage;

  constructor (webhooksStorage: WebhooksStorage, userEventsStorage: UserEventsStorage) {
    this.storage = webhooksStorage;
    this.userEventsStorage = userEventsStorage;
    
  }

  /**
   * Returns all webhooks in a map <username, Arrra<webhooks>>
   */
  async getAll(): Promise<Map<string, Array<Webhook>>> {
    let users;
    const usersRepository = await getUsersRepository(); 
    users = await usersRepository.getAllUsernames();
    const allWebhooks = new Map();
    
    await bluebird.all(users.map(retrieveWebhooks, this));
    return allWebhooks;

    async function retrieveWebhooks(user): Promise<void> {
      const webhooksQuery = {};
      const webhooksOptions = {};

      const webhooks = await bluebird.fromCallback(
        (cb) => this.storage.find(user, webhooksQuery, webhooksOptions, cb)
      );
      const userWebhooks = [];
      webhooks.forEach((w) => {
        userWebhooks.push(initWebhook(user, this, w));
      });
      if (userWebhooks.length > 0) {
        allWebhooks.set(user.username, userWebhooks);
      }
    }
  }

  /** 
   * Return webhooks for a given User and Access.
   * Personal access: returns all webhooks
   * App access: all those created by the access
   */
  async get(user: any, access: any): Promise<Array<Webhook>> {

    let query = {};
    const options = {};

    if (access.isApp()) {
      query.accessId = { $eq: access.id };
    }
    
    const webhooks = await bluebird.fromCallback(
      (cb) => this.storage.find(user, query, options, cb)
    );

    const webhookObjects = [];
    webhooks.forEach((w) => {
      const webhook = initWebhook(user, this, w);
      webhookObjects.push(webhook);
    });

    return webhookObjects;
  }

  /**
   * Returns a webhook for a user, fetched by its id
   */
  async getById(user: any, webhookId: string): Promise<?Webhook> {
    const query = {
      id: { $eq: webhookId }
    };
    const options = {};

    const webhook = await bluebird.fromCallback(
      cb => this.storage.findOne(user, query, options, cb)
    );

    if (webhook == null) return null;

    return initWebhook(user, this, webhook);
  }

  /**
   * Inserts a webhook for a user
   */
  async insertOne(user: {}, webhook: Webhook): Promise<void> {
    await bluebird.fromCallback(cb =>
      this.storage.insertOne(user, webhook.forStorage(), cb)
    );
  }

  /**
   * Updates certain fields of a webhook for a user
   */
  async updateOne(user: {}, update: {}, webhookId: string): Promise<void> {
    const query = { id: webhookId };
    await bluebird.fromCallback(cb =>
      this.storage.updateOne(user, query, update, cb)
    );
  }

  /**
   * Deletes a webhook for a user, given the webhook's id
   */
  async deleteOne(user: {}, webhookId: string): Promise<void> {
    await bluebird.fromCallback(cb =>
      this.storage.delete(user, { id: webhookId }, cb)
    );
  }

  /**
   * Deletes all webhooks for a user.
   */
  async deleteForUser(user: {}): Promise<void> {
    await bluebird.fromCallback(cb =>
      this.storage.delete(user, {}, cb)
    );
  }

}
module.exports = Repository;

function initWebhook (user: {}, repository: Repository, webhook: {}): Webhook {
  return new Webhook(_.merge({
    webhooksRepository: repository,
    user: user,
  }, webhook));
}

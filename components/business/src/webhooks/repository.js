// @flow

const bluebird = require('bluebird');
const _ = require('lodash');

const Webhook = require('./Webhook');
const WebhooksStorage = require('components/storage').StorageLayer.webhooks;
const UsersStorage = require('components/storage').StorageLayer.users;

/** Repository of all Webhooks in this Pryv instance. 
 */
class Repository {
  storage: WebhooksStorage;
  usersStorage: UsersStorage;

  /** Constructs a Webhooks repository based on a Webhooks storage abstraction. 
   * 
   * @param webhooksStorage {WebhooksStorage} handle to the storage methods
   */
  constructor(webhooksStorage: WebhooksStorage, usersStorage: UsersStorage) {
    this.storage = webhooksStorage;
    this.usersStorage = usersStorage;
  }

  async getAll(): Promise<Map<string, Array<Webhook>>> {
    
    const usersQuery = {};
    const usersOptions = { projection: { username: 1 } };
    const users = await bluebird.fromCallback(
      (cb) => this.usersStorage.find(usersQuery, usersOptions, cb)
    );

    const allWebhooks = new Map();
    
    await bluebird.all(users.map(retrieveWebhooks, this));
    return allWebhooks;

    async function retrieveWebhooks(user): Promise<void> {
      const webhooksQuery = {};
      const webhooksOptions = {};

      const webhooks = await bluebird.fromCallback(
        (cb) => this.storage.find(user, webhooksQuery, webhooksOptions, cb)
      );
      // TODO remove log from production
      if (webhooks != null && webhooks.length > 0) {
        console.log('retrieved webhooks for', user);
      }
      const userWebhooks = [];
      webhooks.forEach((w) => {
        userWebhooks.push(initWebhook(user, this.storage, w));
      });
      allWebhooks.set(user.username, userWebhooks);
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
      const webhook = initWebhook(user, this.storage, w);
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

    return initWebhook(user, this.storage, webhook);
  }

}
module.exports = Repository;

function initWebhook(user: {}, storage: WebhooksStorage, webhook: {}): Webhook {
  return new Webhook(_.merge({
    webhooksStorage: storage,
    user: user,
  }, webhook));
}

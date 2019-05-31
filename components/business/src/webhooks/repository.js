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
      if (webhooks != null && webhooks.length > 0)
        console.log('retrieved webhooks for', user);
      const userWebhooks = [];
      webhooks.forEach((w) => {
        userWebhooks.push(new Webhook(_.merge({
          webhooksStorage: this.storage,
          user: user,
        }, w)));
      });
      allWebhooks.set(user.username, userWebhooks);
    }
  }

  /** Return webhooks for a given User and Access. 
   * 
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
      const webhook = new Webhook(w);
      webhookObjects.push(webhook.forApi());
    });

    return webhookObjects;
  }

  async getById(user: any, webhookId: string): Promise<Webhook> {
    const query = {
      id: { $eq: webhookId }
    };
    const options = {};

    const webhook = await bluebird.fromCallback(
      cb => this.storage.findOne(user, query, options, cb)
    );
    return new Webhook(webhook);
  }

}
module.exports = Repository;

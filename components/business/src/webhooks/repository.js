// @flow

const bluebird = require('bluebird');

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
    const usernames = await bluebird.fromCallback(
      (cb) => this.usersStorage.find(usersQuery, usersOptions, cb)
    );

    const allWebhooks = new Map();
    const webhooksQuery = {};
    const webhooksOptions = {};
    usernames.forEach(async (u) => {
      const webhooks = await bluebird.fromCallback(
        (cb) => this.storage.find(u, webhooksQuery, webhooksOptions, cb)
      );
      const userWebhooks = [];
      webhooks.forEach((w) => {
        userWebhooks.push(new Webhook(w));
      });
      allWebhooks.set(u, userWebhooks);
    });
    
    return allWebhooks;
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

}
module.exports = Repository;

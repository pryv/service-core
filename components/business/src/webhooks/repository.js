// @flow

const bluebird = require('bluebird');

const Webhook = require('./Webhook');
const WebhooksStorage = require('components/storage').StorageLayer.webhooks;

/** Repository of all Webhooks in this Pryv instance. 
 */
class Repository {
  storage: WebhooksStorage;

  /** Constructs a Webhooks repository based on a Webhooks storage abstraction. 
   * 
   * @param webhooksStorage {WebhooksStorage} handle to the storage methods
   */
  constructor(webhooksStorage: WebhooksStorage) {
    this.storage = webhooksStorage;
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

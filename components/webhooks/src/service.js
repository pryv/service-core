// @flow

const bluebird = require('bluebird');
const _ = require('lodash');

const NatsSubscriber = require('components/api-server/src/socket-io/nats_subscriber');
const NATS_CONNECTION_URI: string = require('components/utils').messaging.NATS_CONNECTION_URI;


import type { StorageLayer } from 'components/storage';
import type { Logger } from 'components/utils/src/logging';

const Webhook = require('components/business/src/webhooks/Webhook');
const WebhooksRepository = require('components/business/src/webhooks/repository');

class WebhooksService implements MessageSink {

  natsSubscribers: any;
  webhooks: Map<string, Array<Webhook>>;

  repository: WebhooksRepository;
  db: StorageLayer;
  logger: Logger;

  constructor(db: StorageLayer, logger: Logger) {
    this.logger = logger;
    this.repository = new WebhooksRepository(db.webhooks, db.users);
    
  }

  async start() {
    console.log('starting Yo');
    await this.loadWebhooks();
    await this.initSubscribers();
  }

  async initSubscribers(): Promise<void> {
    for(const entry of this.webhooks) {
      const f = initSubscriberForWebhook.bind(this, entry[0]);
      await bluebird.all(entry[1].map(f));
    };
  }

  

  async addWebhook(username: string, webhook: Webhook): Promise<void> {
    let userWebhooks: ?Array<Webhook> = this.webhooks.get(username);
    if (userWebhooks == null) {
      userWebhooks = [];
      this.webhooks.set(username, userWebhooks);
    }
    userWebhooks.push(webhook);
    await initSubscriberForWebhook(username, webhook);
  }

  stop() {
    console.log('stoppin webhooks');
    for (const usernameWebhooks of this.webhooks) {
      usernameWebhooks[1].forEach(w => {
        w.stopNatsSubscriber();
      });
    }
  }

  deliver(userName: string, message: string): void {
    const webhooks = this.webhooks.get(userName);
    if (webhooks == null) return; // no Webhooks;

    webhooks.forEach((webhook) => {
      webhook.send(message);
    });
  }



  async loadWebhooks(): Promise<void> {
    this.webhooks = await this.repository.getAll();
    /*
    const map = new Map();
    this.webhooks = map.set(
      'testuser', 
      [ new Webhook({
        accessId: 'ca123',
        url: 'https://salut.rec.la/hook',
      }) ]
    );*/
  }

}

async function initSubscriberForWebhook(username: string, webhook: Webhook): Promise<void> {
  console.log('initiating subscriber for', username, '@', webhook.url);
  const natsSubscriber = new NatsSubscriber(NATS_CONNECTION_URI, webhook);
  await natsSubscriber.subscribe(username);
  webhook.setNatsSubscriber(natsSubscriber);
}

module.exports = WebhooksService;
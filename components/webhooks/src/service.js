// @flow

const NatsSubscriber = require('components/api-server/src/socket-io/nats_subscriber');
const NATS_CONNECTION_URI: string = require('components/utils').messaging.NATS_CONNECTION_URI;

import type { MessageSink } from 'components/api-server/src/socket-io/message_sink';
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
    console.log('started Yo');
    await this.loadWebhooks();
    let num = 0;
    this.webhooks.forEach((webhooks, username) => {
      webhooks.forEach((webhook) => {
        this.initSubscriber(username, webhook);
        num++;
      });
    });
    console.log('loaded', num, 'webhooks');
  }

  initSubscriber(username: string, webhook: Webhook) {
    const natsSubscriber = new NatsSubscriber(NATS_CONNECTION_URI, this);
    natsSubscriber.subscribe(username);
    webhook.setNatsSubscriber(natsSubscriber);
  }

  addWebhook(username: string, webhook: Webhook) {
    let userWebhooks: ?Array<Webhook> = this.webhooks.get(username);
    if (userWebhooks == null) {
      userWebhooks = [];
      this.webhooks.set(username, userWebhooks);
    }
    userWebhooks.push(webhook);
    this.initSubscriber(username, webhook);
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
module.exports = WebhooksService;
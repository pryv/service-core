// @flow

const bluebird = require('bluebird');

const NatsSubscriber = require('components/api-server/src/socket-io/nats_subscriber');
const NATS_CONNECTION_URI: string = require('components/utils').messaging.NATS_CONNECTION_URI;
const WEBHOOKS_CREATE_CHANNEL: string = require('components/utils').messaging.NATS_WEBHOOKS_CREATE;
const WEBHOOKS_DELETE_CHANNEL: string = require('components/utils').messaging.NATS_WEBHOOKS_DELETE;


import type { MessageSink } from 'components/api-server/src/socket-io/message_sink';
import type { StorageLayer } from 'components/storage';
import type { Logger } from 'components/utils/src/logging';

const Webhook = require('components/business/src/webhooks/Webhook');
const WebhooksRepository = require('components/business/src/webhooks/repository');

type UsernameWebhook = {
  username: string,
  webhook: {},
};

class WebhooksService implements MessageSink {

  natsSubscribers: any;
  createListener: NatsSubscriber;
  deleteListener: NatsSubscriber;
  webhooks: Map<string, Array<Webhook>>;

  repository: WebhooksRepository;
  db: StorageLayer;
  logger: Logger;

  constructor(db: StorageLayer, logger: Logger) {
    this.logger = logger;
    this.repository = new WebhooksRepository(db.webhooks, db.users);
  }

  async start() {
    await this.subscribeToDeleteListener();
    await this.subscribeToCreateListener();
    await this.loadWebhooks();
    await this.initSubscribers();
  }

  async subscribeToDeleteListener(): Promise<void> {
    this.deleteListener = new NatsSubscriber(NATS_CONNECTION_URI, this);
    await this.deleteListener.subscribe(WEBHOOKS_DELETE_CHANNEL);
  }

  async subscribeToCreateListener(): Promise<void> {
    this.createListener = new NatsSubscriber(NATS_CONNECTION_URI, this);
    await this.createListener.subscribe(WEBHOOKS_CREATE_CHANNEL);
  }

  async initSubscribers(): Promise<void> {
    for(const entry of this.webhooks) {
      const f = initSubscriberForWebhook.bind(this, entry[0]);
      await bluebird.all(entry[1].map(f));
    }
  }

  deliver(channel: string, usernameWebhook: UsernameWebhook): void {
    //console.log('received notification for', channel, 'with', usernameWebhook);

    switch(channel) {
      case WEBHOOKS_CREATE_CHANNEL:
        this.addWebhook(usernameWebhook.username, new Webhook(usernameWebhook.webhook));
        break;
      case WEBHOOKS_DELETE_CHANNEL:

        break;
    }
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

  stop(): void {
    console.log('stoppin webhooks');
    for (const usernameWebhooks of this.webhooks) {
      usernameWebhooks[1].forEach(w => {
        w.stopNatsSubscriber();
      });
    }
  }

  async loadWebhooks(): Promise<void> {
    this.webhooks = await this.repository.getAll();
  }

}

async function initSubscriberForWebhook(username: string, webhook: Webhook): Promise<void> {
  console.log('initiating subscriber for', username, '@', webhook.url);
  const natsSubscriber = new NatsSubscriber(NATS_CONNECTION_URI, webhook, 
    function channelForUser(username: string): string {
      return `${username}.wh1`;
    });
  await natsSubscriber.subscribe(username);
  webhook.setNatsSubscriber(natsSubscriber);
}

module.exports = WebhooksService;
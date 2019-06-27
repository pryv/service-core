// @flow

const bluebird = require('bluebird');
const _ = require('lodash');

const NatsSubscriber = require('components/api-server/src/socket-io/nats_subscriber');
const WEBHOOKS_CREATE_CHANNEL: string = require('components/utils').messaging.NATS_WEBHOOKS_CREATE;
const WEBHOOKS_DELETE_CHANNEL: string = require('components/utils').messaging.NATS_WEBHOOKS_DELETE;


import type { MessageSink } from 'components/api-server/src/socket-io/message_sink';
import type { StorageLayer } from 'components/storage';
import type { Logger } from 'components/utils/src/logging';
const Settings = require('./settings');

const Webhook = require('components/business/src/webhooks/Webhook');
const WebhooksRepository = require('components/business/src/webhooks/repository');

const { ProjectVersion } = require('components/middleware/src/project_version');

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
  settings: Settings;
  NATS_CONNECTION_URI: string;

  apiVersion: string;

  constructor(params: {
    storage: StorageLayer, 
    logger: Logger,
    settings: settings,
    }) {
    this.logger = params.logger;
    this.repository = new WebhooksRepository(params.storage.webhooks, params.storage.users);
    this.settings = params.settings;
    this.NATS_CONNECTION_URI = this.settings.get('nats.uri').str();
  }

  async start() {
    await this.subscribeToDeleteListener();
    await this.subscribeToCreateListener();
    await this.loadWebhooks();
    await this.initSubscribers();
    this.logger.info('started');
    const pv = new ProjectVersion(); 
    this.apiVersion = await pv.version(); 
  }

  async subscribeToDeleteListener(): Promise<void> {
    this.deleteListener = new NatsSubscriber(this.NATS_CONNECTION_URI, this);
    await this.deleteListener.subscribe(WEBHOOKS_DELETE_CHANNEL);
  }

  async subscribeToCreateListener(): Promise<void> {
    this.createListener = new NatsSubscriber(this.NATS_CONNECTION_URI, this);
    await this.createListener.subscribe(WEBHOOKS_CREATE_CHANNEL);
  }

  async initSubscribers(): Promise<void> {
    for(const entry of this.webhooks) {
      const f = initSubscriberForWebhook.bind(this, entry[0]);
      await bluebird.all(entry[1].map(f));
    }
  }

  deliver(channel: string, usernameWebhook: UsernameWebhook): void {
    switch(channel) {
      case WEBHOOKS_CREATE_CHANNEL:
        this.addWebhook(usernameWebhook.username, 
          new Webhook(_.extend(
            {}, 
            usernameWebhook.webhook,
            { 
              webhooksStorage: this.storage,
              user: {
                username: usernameWebhook.username,
              },
            }
          ))
        );
        break;
      case WEBHOOKS_DELETE_CHANNEL:
        this.stopWebhook(usernameWebhook.username, usernameWebhook.webhook.id);
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
    this.logger.info(`Loaded webhook ${webhook.id} for ${username}`);
  }

  stopWebhook(username: string, webhookId: string): void {
    let usersWebhooks = this.webhooks.get(username);
    usersWebhooks = usersWebhooks.filter(w => {
      if (w.id === webhookId) {
        w.stop();
      }
      return w.id !== webhookId;
    });
    this.webhooks.set(username, usersWebhooks);
    this.logger.info(`Stopped webhook ${webhookId} for ${username}`);
  }

  stop(): void {
    this.logger.info('Stopping webhooks service');
    for (const usernameWebhooks of this.webhooks) {
      usernameWebhooks[1].forEach(w => {
        w.stop();
      });
    }
  }

  async loadWebhooks(): Promise<void> {
    this.webhooks = await this.repository.getAll();
  }

}

async function initSubscriberForWebhook(username: string, webhook: Webhook): Promise<void> {
  const natsSubscriber = new NatsSubscriber(this.NATS_CONNECTION_URI, webhook, 
    function channelForUser(username: string): string {
      return `${username}.wh1`;
    });
  await natsSubscriber.subscribe(username);
  webhook.setNatsSubscriber(natsSubscriber);
  webhook.setApiVersion(this.apiVersion);
}

module.exports = WebhooksService;
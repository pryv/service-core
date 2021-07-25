/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const _ = require('lodash');

const { pubsub } = require('messages');
const { NatsSubscriber } = require('messages');


import type { MessageSink } from 'messages';
import type { StorageLayer } from 'storage';

const Webhook = require('business/src/webhooks/Webhook');
const WebhooksRepository = require('business/src/webhooks/repository');

const { getAPIVersion } = require('middleware/src/project_version');

const BOOT_MESSAGE = require('./messages').BOOT_MESSAGE;

type UsernameWebhook = {
  username: string,
  webhook: Webhook,
};

class WebhooksService {

  webhooks: Map<string, Array<Webhook>>;

  repository: WebhooksRepository;
  logger;

  apiVersion: string;
  serial: string;

  constructor(params: {
    storage: StorageLayer,
    logger: Logger
  }) {
    this.logger = params.logger;
    this.repository = new WebhooksRepository(params.storage.webhooks, params.storage.events);
    this.settings = params.settings;

    this.NATS_CONNECTION_URI = this.settings.get('nats:uri');
  }

  async start() {
    this.apiVersion = await getAPIVersion();
    this.serial = this.settings.get('service:info:serial');

    this.logger.info('Loading service with version ' + this.apiVersion + ' and serial ' + this.serial + '.');

    await pubsub.init();
    this.subscribeListeners();
    this.logger.info('Listeners for webhooks creation/deletion up.');

    await this.loadWebhooks();
    this.logger.info('Loaded webhooks for ' + this.webhooks.size + ' user(s).');

    const numWebhooks: number = await this.setMeta.call(this);

    await this.sendBootMessage();
    this.logger.info(BOOT_MESSAGE + ' sent.');

    await this.initSubscribers();
    this.logger.info(numWebhooks + ' webhook(s) listening to changes from core.');
  }

  subscribeListeners() {
    pubsub.on(pubsub.NATS_WEBHOOKS_DELETE, this.onStop.bind(this) );
    pubsub.on(pubsub.NATS_WEBHOOKS_CREATE, this.onCreate.bind(this));
    pubsub.on(pubsub.NATS_WEBHOOKS_ACTIVE, this.onActivate.bind(this));
  }

  setMeta(): number {
    let numWebhooks: number = 0;
    for (const entry of this.webhooks) {
      const userWebhooks = entry[1];
      userWebhooks.forEach(w => {
        w.setApiVersion(this.apiVersion);
        w.setSerial(this.serial);
        w.setLogger(this.logger);
        numWebhooks++;
      });
    }
    return numWebhooks;
  }

  async sendBootMessage(): Promise<void> {
    for (const entry of this.webhooks) {
      await bluebird.all(entry[1].map(async (webhook) => {
        await webhook.send(BOOT_MESSAGE);
      }));
    }
  }

  async initSubscribers(): Promise<void> {
    for (const entry of this.webhooks) {
      const username: string = entry[0];
      const webhooks: Array<Webhook> = entry[1];
      for (const webhook of webhooks) {
        webhook.startListenting(username);
      }
      //const f = initSubscriberForWebhook.bind(this, username, this.apiVersion, this.serial);
      //await bluebird.all(webhooks.map(f));
    }
  }

  onCreate(usernameWebhook: UsernameWebhook): void {
    this.addWebhook(
      usernameWebhook.username,
      new Webhook(
        _.extend({}, usernameWebhook.webhook, {
          webhooksRepository: this.repository,
          user: {
            username: usernameWebhook.username
          }
        })
      )
    );
  }

  onActivate(usernameWebhook: UsernameWebhook): void {
    this.activateWebhook(
      usernameWebhook.username,
      usernameWebhook.webhook,
    );
  }

  onStop(usernameWebhook: UsernameWebhook): void {
     this.stopWebhook(usernameWebhook.username, usernameWebhook.webhook.id);
  }

  async addWebhook(username: string, webhook: Webhook): Promise<void> {
    let userWebhooks: ?Array<Webhook> = this.webhooks.get(username);
    if (userWebhooks == null) {
      userWebhooks = [];
      this.webhooks.set(username, userWebhooks);
    }
    userWebhooks.push(webhook);
    webhook.startListenting(username)
    //await initSubscriberForWebhook.call(this, username, this.apiVersion, this.serial, webhook);
    this.logger.info(`Loaded webhook ${webhook.id} for ${username}`);
  }

  async activateWebhook(username: string, webhook: Webhook): void {
    let userWebhooks: Array<Webhook> = this.webhooks.get(username);
    const stoppedWebhook: Webhook = userWebhooks.filter(w => w.id === webhook.id)[0];
    stoppedWebhook.state = 'active';
    this.logger.info(`Reactivated webhook ${stoppedWebhook.id} for ${username}`);
  }

  stopWebhook(username: string, webhookId: string): void {
    const [usersWebhooks: Array<Webhook>, webhook: Webhook, idx: number ] = this.getWebhook(username, webhookId);
    if (webhook == null || usersWebhooks == null || idx == null) {
        this.logger.warn(`Could not retrieve webhook ${webhookId} for ${username} to stop it.`);
      return;
    }
    webhook.stop();
    usersWebhooks.splice(idx, 1);
    this.webhooks.set(username, usersWebhooks);
    this.logger.info(`Stopped webhook ${webhookId} for ${username}`);
  }

  getWebhook(username: string, webhookId: string): [ ?Array<Webhook>, ?Webhook, ?number ] {
    const usersWebhooks: ?Array<Webhook> = this.webhooks.get(username);

    if (usersWebhooks == null) {
      return [ null, null, null ];
    }

    const len = usersWebhooks.length;
    
    for(let i=0; i<len; i++) {
      if (usersWebhooks[i].id === webhookId) {
        return [ usersWebhooks, usersWebhooks[i], i ];
      }
    }
    return [ null, null, null ];
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

async function initSubscriberForWebhook(username: string, apiVersion: string, serial: string, webhook: Webhook): Promise<void> {
  const natsSubscriber = new NatsSubscriber(this.NATS_CONNECTION_URI, webhook,
    function channelForUser(username: string): string {
      return `${username}.wh1`;
    });
  await natsSubscriber.subscribe(username);
  webhook.setNatsSubscriber(natsSubscriber);
}
module.exports = WebhooksService;
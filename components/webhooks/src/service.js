/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const bluebird = require('bluebird');
const _ = require('lodash');

const NatsSubscriber = require('components/api-server/src/socket-io/nats_subscriber');
const WEBHOOKS_CREATE_CHANNEL: string = require('components/utils').messaging.NATS_WEBHOOKS_CREATE;
const WEBHOOKS_ACTIVATE_CHANNEL: string = require('components/utils').messaging.NATS_WEBHOOKS_ACTIVATE;
const WEBHOOKS_DELETE_CHANNEL: string = require('components/utils').messaging.NATS_WEBHOOKS_DELETE;


import type { MessageSink } from 'components/api-server/src/socket-io/message_sink';
import type { StorageLayer } from 'components/storage';
import type { Logger } from 'components/utils/src/logging';
const Settings = require('./settings');

const Webhook = require('components/business/src/webhooks/Webhook');
const WebhooksRepository = require('components/business/src/webhooks/repository');

const { ProjectVersion } = require('components/middleware/src/project_version');

const BOOT_MESSAGE = require('./messages').BOOT_MESSAGE;

type UsernameWebhook = {
  username: string,
  webhook: Webhook,
};

class WebhooksService implements MessageSink {

  createListener: NatsSubscriber;
  deleteListener: NatsSubscriber;
  webhooks: Map<string, Array<Webhook>>;

  repository: WebhooksRepository;
  logger: Logger;
  settings: Settings;
  NATS_CONNECTION_URI: string;

  apiVersion: string;
  serial: string;

  constructor(params: {
    storage: StorageLayer,
    logger: Logger,
    settings: Settings,
  }) {
    this.logger = params.logger;
    this.repository = new WebhooksRepository(params.storage.webhooks, params.storage.users);
    this.settings = params.settings;
    this.NATS_CONNECTION_URI = this.settings.get('nats:uri');
  }

  async start() {
    const pv = new ProjectVersion();
    this.apiVersion = pv.version();
    this.serial = this.settings.get('service:info:serial');

    this.logger.info('Loading service with version ' + this.apiVersion + ' and serial ' + this.serial + '.');

    await this.subscribeToDeleteListener();
    await this.subscribeToCreateListener();
    await this.subscribeToActivateListener();
    this.logger.info('Listeners for webhooks creation/deletion up.');

    await this.loadWebhooks();
    this.logger.info('Loaded webhooks for ' + this.webhooks.size + ' user(s).');

    const numWebhooks: number = await this.setMeta.call(this);

    await this.sendBootMessage();
    this.logger.info(BOOT_MESSAGE + ' sent.');

    await this.initSubscribers();
    this.logger.info(numWebhooks + ' webhook(s) listening to changes from core.');

  }

  async subscribeToDeleteListener(): Promise<void> {
    this.deleteListener = new NatsSubscriber(this.NATS_CONNECTION_URI, this);
    await this.deleteListener.subscribe(WEBHOOKS_DELETE_CHANNEL);
  }

  async subscribeToCreateListener(): Promise<void> {
    this.createListener = new NatsSubscriber(this.NATS_CONNECTION_URI, this);
    await this.createListener.subscribe(WEBHOOKS_CREATE_CHANNEL);
  }

  async subscribeToActivateListener(): Promise<void> {
    this.createListener = new NatsSubscriber(this.NATS_CONNECTION_URI, this);
    await this.createListener.subscribe(WEBHOOKS_ACTIVATE_CHANNEL);
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
      const f = initSubscriberForWebhook.bind(this, username, this.apiVersion, this.serial);
      await bluebird.all(webhooks.map(f));
    }
  }

  deliver(channel: string, usernameWebhook: UsernameWebhook): void {
    switch (channel) {
      case WEBHOOKS_CREATE_CHANNEL:
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
        break;
      case WEBHOOKS_ACTIVATE_CHANNEL:
        this.activateWebhook(
          usernameWebhook.username,
          usernameWebhook.webhook,
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
    await initSubscriberForWebhook.call(this, username, this.apiVersion, this.serial, webhook);
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
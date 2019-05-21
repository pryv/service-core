// @flow

const NatsSubscriber = require('components/api-server/src/socket-io/nats_subscriber');
const NATS_CONNECTION_URI: string = require('components/utils').messaging.NATS_CONNECTION_URI;

import type { MessageSink } from 'components/api-server/src/socket-io/message_sink';

const Webhook = require('./Webhook');

class WebhooksServer implements MessageSink {

  natsSubscribers: any;
  webhooks: Map<string, Array<Webhook>>;

  constructor() {
    this.webhooks = this.loadWebhooks();
  }

  listen() {
    this.webhooks.forEach((webhooks, username) => {
      webhooks.forEach((webhook) => {
        this.initSubscriber(username, webhook);
      });
    });
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



  loadWebhooks(): Map<string, Array<Webhook>> {
    const map = new Map();
    return map.set(
      'testuser', 
      [ new Webhook({
        accessId: 'ca123',
        url: 'https://salut.rec.la/hook',
      }) ]
    );
  }

}
module.exports = WebhooksServer;
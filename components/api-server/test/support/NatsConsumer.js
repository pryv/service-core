/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

const EventEmitter = require('events');

const NatsSubscriber = require('components/api-server/src/socket-io/nats_subscriber');
import type { MessageSink } from 'components/api-server/src/socket-io/message_sink';

class NatsConsumer extends EventEmitter implements MessageSink  {

  channel = '';
  listener = null;
  messages = [];

  constructor(params) {
    super();

    this.channel = params.channel;

    this.listener = new NatsSubscriber(params.uri, this);
  }

  async init() {
    await this.listener.subscribe(this.channel);
  }

  deliver(channel: string, payload: {}): void {
    switch (channel) {
      case this.channel:
        console.log('got msg on ma chanel', payload);
        this.messages.push(payload);
        this.emit('msg_received');
        break;
      default:
        console.log('got msg on default', payload);
    }
  }

}

module.exports = NatsConsumer;

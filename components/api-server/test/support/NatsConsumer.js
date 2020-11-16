// @flow

const NatsSubscriber = require('components/api-server/src/socket-io/nats_subscriber');
import type { MessageSink } from 'components/api-server/src/socket-io/message_sink';

class NatsConsumer implements MessageSink {

  channel = '';
  listener = null;
  messages = [];

  constructor(params) {
    this.channel = params.channel;

    this.listener = new NatsSubscriber(params.uri, this);
  }

  async init() {
    await this.createListener.subscribe(this.channel);
  }

  deliver(channel: string, payload: {}): void {
    switch (channel) {
      case this.channel:
        console.log('got msg on ma chanel', payload);
        this.messages.push(payload);
        break;
      default:
        console.log('got msg on default', payload);
    }
  }

}

module.exports = NatsConsumer;

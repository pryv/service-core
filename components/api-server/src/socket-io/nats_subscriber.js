// @flow

import type { MessageSink } from './message_sink';

const awaiting = require('awaiting');
const NATS = require('nats');
const { decode } = require('./nats_wire_message');

// Receives messages from a single NATS channel (use #subscribe) and delivers
// them to a message sink.
//
class NatsSubscriber {
  conn: NATS.Client;

  sink: MessageSink;

  // What user we subscribed to - or `null` if no subscription was made yet.
  subscriptionUser: ?string;

  // Provides a function to apply to the channel name
  channelFormat: (string) => string;

  // Connects to the NATS server on `natsUri` (in the form of
  // 'nats://nats.io:4222'). Messages that arrive here via subscriptions made
  // (#subscribe) are sent to `sink`.
  //
  // @example
  //
  //    const subscriber = new NatsSubscriber(natsUrl, sink);
  //    await subscriber.subscribe('USERNAME')
  //
  constructor(natsUri: string, sink: MessageSink, channelFormat?: (string) => string) {
    this.conn = NATS.connect({
      url: natsUri,
      preserveBuffers: true,
    });
    this.sink = sink;
    this.channelFormat = channelFormat || ((a) => a);

    this.subscriptionUser = null;
  }

  // Creates a NATS subscription for username. Channels are named after the
  // user: 'USERNAME.sok1', the postfix meaning 'socket-io', comm protocol v1.
  //
  async subscribe(username: string): Promise<void> {
    const { conn } = this;
    const channelName = this.channelFormat(username);
    const { subscriptionUser } = this;

    if (subscriptionUser != null) { throw new Error('Double subscription on NatsSubscriber: Currently, you can only subscribe once.'); }

    this.subscriptionUser = username;

    const subscribed = awaiting.event(conn, 'subscribe');
    conn.subscribe(channelName, (buf) => this.dispatch(buf));

    // Wait until subscription is done.
    return subscribed;
  }

  // Closes this NatsSubscriber's connections. This unsubscribes and closes  the
  // connection to the NATS server in particular. The instance will be useless
  // after this.
  //
  close() {
    const { conn } = this;

    conn.close();
  }

  // Dispatches a single message received from NATS.
  //
  dispatch(buf: Buffer) {
    const { subscriptionUser } = this;
    const { sink } = this;

    if (subscriptionUser == null) { throw new Error('AF: subscriptionUser may not be null here.'); }

    const msg = decode(buf);

    sink.deliver(subscriptionUser, msg);
  }
}

module.exports = NatsSubscriber;

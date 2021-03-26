/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow

import type { MessageSink } from './message_sink';
export type { MessageSink };

module.exports = {
  NatsPublisher: require('./nats_publisher'),
  NatsSubscriber: require('./nats_subscriber'),
  axonMessaging: require('./axon_messaging'),
  Notifications: require('./Notifications'),
}

module.exports.NATS_CONNECTION_URI = 'nats://127.0.0.1:4222';

module.exports.NATS_WEBHOOKS_CREATE = 'wh.creates';
module.exports.NATS_WEBHOOKS_ACTIVATE = 'wh.activates';
module.exports.NATS_WEBHOOKS_DELETE = 'wh.deletes';

module.exports.NATS_UPDATE_EVENT = 'events.update';
module.exports.NATS_DELETE_EVENT = 'events.delete';

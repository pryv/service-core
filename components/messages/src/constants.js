/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

module.exports.SERVER_READY = 'server-ready';


module.exports.WEBHOOKS_CREATE = 'wh.creates'; // {username, webhook}
module.exports.WEBHOOKS_ACTIVATE = 'wh.activates'; // {username, webhook}
module.exports.WEBHOOKS_DELETE = 'wh.deletes'; // {username, webhook}

module.exports.SERIES_UPDATE_EVENTID_USERNAME = 'events.update'; // {username, event: { id }}
module.exports.SERIES_DELETE_EVENTID_USERNAME = 'events.delete'; // {username, event: { id }}

// usernamed-based events
module.exports.USERNAME_BASED_EVENTS_CHANGED = 'events-changed'; 
module.exports.USERNAME_BASED_STREAMS_CHANGED = 'streams-changed';
module.exports.USERNAME_BASED_ACCESSES_CHANGED = 'accesses-changed';
module.exports.USERNAME_BASED_ACCOUNT_CHANGED = 'account-changed';
module.exports.USERNAME_BASED_FOLLOWEDSLICES_CHANGED = 'followed-slices-changed';

// pubsub working mode
module.exports.NATS_MODE_ALL = 'all'; // all messages matching are serialized 
module.exports.NATS_MODE_KEY = 'key'; // subscriptions and emit are bound to a key (eg username)
module.exports.NATS_MODE_NONE = 'none'; // don't use nats
/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
module.exports.NATS_CONNECTION_URI = 'nats://127.0.0.1:4222';

module.exports.SERVER_READY = 'server-ready'; // standalone event with no payload


module.exports.WEBHOOKS_CREATE = 'wh-creates'; // payload: {username, webhook}
module.exports.WEBHOOKS_ACTIVATE = 'wh-activates'; // payload: {username, webhook}
module.exports.WEBHOOKS_DELETE = 'wh-deletes'; //  payload: {username, webhook}

module.exports.SERIES_UPDATE_EVENTID_USERNAME = 'series-events-update'; // {username, event: { id }}
module.exports.SERIES_DELETE_EVENTID_USERNAME = 'series-events-delete'; // {username, event: { id }}

// usernamed-based events
//module.exports.USERNAME_BASED_EVENTS_CHANGED = 'events-changed'; 
module.exports.USERNAME_BASED_STREAMS_CHANGED = 'streams-changed';
module.exports.USERNAME_BASED_ACCESSES_CHANGED = 'accesses-changed';
module.exports.USERNAME_BASED_ACCOUNT_CHANGED = 'account-changed';
module.exports.USERNAME_BASED_FOLLOWEDSLICES_CHANGED = 'followed-slices-changed';

// usernamed-based events
module.exports.USERNAME_BASED_EVENTS_CHANGED = {eventMask: 'user.{key}.events', eventName: 'event-change'};  // key = 'user-{username}' payload = {eventName: 'events-changed'}
//module.exports.USERNAME_BASED_STREAMS_CHANGED =  {eventMask: 'user.{key}.streams', eventName: 'stream-change'};
//module.exports.USERNAME_BASED_ACCESSES_CHANGED = {eventMask: 'user.{key}.accesses', eventName: 'access-change'};
//module.exports.USERNAME_BASED_ACCOUNT_CHANGED = {eventMask: 'user.{key}.account', eventName: 'account-change'};
//module.exports.USERNAME_BASED_FOLLOWEDSLICES_CHANGED = {eventMask: 'user.{key}.followed-slices', eventName: 'followed-slices-change'};
module.exports.USERNAME_BASED_ALL = {eventMask: 'user.{key}.*'};
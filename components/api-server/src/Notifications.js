var events = require('events'),
    util = require('util');

module.exports = Notifications;

/**
 * Simple event emitter to dispatch notifications.
 * Notifications are sent to in-process listeners as well as other processes subscribing to the
 * server's TCP pub socket.
 */
function Notifications(messagingSocket) {
  Notifications.super_.call(this);
  this.messagingSocket = messagingSocket;
}
util.inherits(Notifications, events.EventEmitter);

var Messages = {
  ServerReady: 'server-ready',
  AccountChanged: 'account-changed',
  AccessesChanged: 'accesses-changed',
  FollowedSlicesChanged: 'followed-slices-changed',
  StreamsChanged: 'streams-changed',
  EventsChanged: 'events-changed'
};

Notifications.prototype.serverReady = function () {
  send.call(this, Messages.ServerReady);
};

/**
 * User-level notification.
 */
Notifications.prototype.accountChanged = function (user) {
  send.call(this, Messages.AccountChanged, user);
};

/**
 * User-level notification.
 */
Notifications.prototype.accessesChanged = function (user) {
  send.call(this, Messages.AccessesChanged, user);
};

/**
 * User-level notification.
 */
Notifications.prototype.followedSlicesChanged = function (user) {
  send.call(this, Messages.FollowedSlicesChanged, user);
};

/**
 * User-level notification.
 */
Notifications.prototype.streamsChanged = function (user) {
  send.call(this, Messages.StreamsChanged, user);
};

/**
 * User-level notification.
 */
Notifications.prototype.eventsChanged = function (user) {
  send.call(this, Messages.EventsChanged, user);
};

/**
 * @this {Notifications}
 * @param {String} message
 * @param {Object} user Optional
 */
function send(/*message, user*/) {
  this.emit.apply(this, arguments);
  this.messagingSocket.emit.apply(this, arguments);
}

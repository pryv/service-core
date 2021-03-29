/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Helper for opening inter-process TCP axonMessaging sockets.
 */

var axon = require('axon');

/**
 * @param {{host: String, port: Number, pubConnectInsteadOfBind: Boolean}} settings
 * @param {Function({Error}, {Object})} callback Called passing the `EventEmitter` for TCP messages
 */
exports.openPubSocket = function (settings, callback) {
  var socket = axon.socket('pub-emitter');
  if (settings.pubConnectInsteadOfBind) {
    socket.connect(+settings.port, settings.host, onSocketOpened);
  } else {
    socket.bind(+settings.port, settings.host, onSocketOpened);
  }

  function onSocketOpened(err) {
    if (err) { return callback(err); }
    callback(null, socket);
  }
};

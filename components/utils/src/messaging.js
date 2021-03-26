/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Helper for opening inter-process TCP messaging sockets.
 */

var axon = require('axon');
var { getConfig } = require('@pryv/boiler');

exports.NATS_CONNECTION_URI = 'nats://127.0.0.1:4222';

exports.NATS_WEBHOOKS_CREATE = 'wh.creates';
exports.NATS_WEBHOOKS_ACTIVATE = 'wh.activates';
exports.NATS_WEBHOOKS_DELETE = 'wh.deletes';

exports.NATS_UPDATE_EVENT = 'events.update';
exports.NATS_DELETE_EVENT = 'events.delete';

/**
 * @param {{host: String, port: Number}} settings
 * @param {Function({Error}, {Object})} callback Called passing the `EventEmitter` for TCP messages
 */
exports.openPubSocket = async function () {
  const config = await getConfig();
  const settings = config.get('tcpMessaging');
  console.log('XXXX PUB', settings);
  var socket = axon.socket('pub-emitter');
  
  if (settings.port !== 4000) {
    console.group('ZZZZ', new Error);
  }
  try { 
    socket.connect(settings.port, settings.host, onSocketOpened);
  } catch (e) {
    console.log('EEEEE', e);
  }
  console.log('XXXX PUB IN');
  let socketOpenDone, socketOpenError;
  const donePromise = new Promise((resolve, reject) => {
    socketOpenDone = resolve;
    socketOpenError = reject;
  });
  function onSocketOpened(err) {
    console.log('YYYY PUB', settings, err);
    if (err) { return socketOpenError(err); }
    socketOpenDone(socket);
  }
  return donePromise;
};

/**
 * @param {{host: String, port: Number, pubConnectInsteadOfBind: Boolean}} settings
 * @param {Function({Error}, {Object})} callback Called passing the `EventEmitter` for TCP messages
 */
 exports.startPubServer = async function () {
  const config = await getConfig();
  const settings = config.get('tcpMessaging');
  console.log('XXXX SERVER', settings);
  const socket = axon.socket('pub-emitter');
  
  socket.bind(settings.port, settings.host, onSocketOpened);
  
  let socketOpenDone, socketOpenError;
  const donePromise = new Promise((resolve, reject) => {
    socketOpenDone = resolve;
    socketOpenError = reject;
  });

  function onSocketOpened(err) {
    console.log('YYYY SERVER', settings, err);
    if (err) { return socketOpenError(err); }
    socketOpenDone(socket);
  }
  return donePromise;
};

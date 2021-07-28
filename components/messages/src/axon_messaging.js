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
const { getConfig, getLogger } = require('@pryv/boiler');

let axonSocket = null;
let initalizing = false;
exports.getTestNotifier = async function() {
  while (initalizing) { await new Promise((r) => setTimeout(r, 50))}
  if (axonSocket != null) return axonSocket;
  const logger = getLogger('test-messaging')
  initializing = true;
  const config = await getConfig();
  const axonSettings = config.get('axonMessaging');

  try { 
    axonSocket = await openPubSocket(axonSettings);
  } catch(e) {
    logger.error('Error setting up TCP pub socket: ' + err);
    process.exit(1);
  }

  logger.info('TCP pub socket ready on ' + axonSettings.host + ':' + axonSettings.port);

  initializing = false;
  return axonSocket;
}


/**
 * @param {{host: String, port: Number, pubConnectInsteadOfBind: Boolean}} settings
 */
function openPubSocket(settings) {
  return new Promise((resolve, reject) => {
    var socket = axon.socket('pub-emitter');
    if (settings.pubConnectInsteadOfBind) {
      socket.connect(+settings.port, settings.host, onSocketOpened);
    } else {
      socket.bind(+settings.port, settings.host, onSocketOpened);
    }

    function onSocketOpened(err) {
      if (err) { return reject(err); }
      resolve(socket);
    }
  });
};

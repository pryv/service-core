/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */
module.exports = {
  testMessaging: require('./test_messaging'),
  axonMessaging: require('./test_messaging'), // backward compat alias
  pubsub: require('./pubsub')
};
Object.assign(module.exports, require('./constants'));

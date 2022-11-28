/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/**
 * Helper functions for serializing/deserializing setup instructions for tests.
 * Added to support injecting mocks in server instance (separate process) from
 * tests.
 */
const logger = require('@pryv/boiler').getLogger('instance-test-setup');
/**
 * @param {Object} settings The main configuration settings
 * @param {Object} setup Must have method `execute()` and be self-contained (i.e. no reference
 *                       to outside scope, except for possible module dependencies e.g. mocking
 *                       lib which must then be declared in the current module's package).
 *                       Possible context must be passed via property `context`.
 *                       A `messagingSocket` property will be injected into `context` at execution
 *                       time to allow passing messages back to the test process.
 */
exports.set = function (settings, setup) {
  if (!settings || !setup) {
    throw new Error('Expected config and setup object arguments');
  }
  settings.instanceTestSetup = stringify(setup);
};
exports.clear = function (settings) {
  delete settings.instanceTestSetup;
};
/**
 * @throws Any error encountered deserializing or calling the setup function
 */
exports.execute = function (testSetup, testNotifier) {
  const obj = parse(testSetup);
  if (obj.context != null) {
    // inject TCP axonMessaging socket to allow passing data back to test process
    obj.context.testNotifier = testNotifier;
  }
  obj.execute();
};
/**
 * @returns {string}
 */
function stringify (obj) {
  return JSON.stringify(obj, function (key, value) {
    // stringify functions with their source, converting CRLF.
    //
    // NOTE If you strip CRLF here, any comment in the serialized function will
    // comment out the rest of the line.
    //
    return typeof value === 'function'
      ? value.toString().replace(/\r?\n|\n/g, '\n')
      : value;
  });
}
/**
 * @returns {any}
 */
function parse (str) {
  try {
    return JSON.parse(str, function (key, value) {
      logger.debug('eval', value);
      if (typeof value !== 'string') {
        return value;
      }
      return value.substring(0, 8) === 'function'
        // eslint-disable-next-line no-eval
        ? eval('(' + value + ')')
        : value;
    });
  } catch (e) {
    logger.debug('Failed parsing string:', str);
    throw e;
  }
}

// @flow

/**
 * Helper functions for serializing/deserializing setup instructions for tests.
 * Added to support injecting mocks in server instance (separate process) from
 * tests.
 */

/**
 * @param {Object} settings The main configuration settings
 * @param {Object} setup Must have method `execute()` and be self-contained (i.e. no reference
 *                       to outside scope, except for possible module dependencies e.g. mocking
 *                       lib which must then be declared in the current module's package).
 *                       Possible context must be passed via property `context`.
 *                       A `messagingSocket` property will be injected into `context` at execution
 *                       time to allow passing messages back to the test process.
 */
exports.set = function (settings: any, setup: any) {
  if (!settings || !setup) {
    throw new Error('Expected config and setup object arguments');
  }
  settings.instanceTestSetup = stringify(setup);
};

exports.clear = function (settings: any) {
  delete settings.instanceTestSetup;
};

/**
 * @throws Any error encountered deserializing or calling the setup function
 */
exports.execute = function (testSetup: string, messagingSocket: any) {
  const obj = parse(testSetup);

  if (obj.context != null) {
    // inject TCP messaging socket to allow passing data back to test process
    obj.context.messagingSocket = messagingSocket;
  }

  obj.execute();
};

function stringify(obj) {
  return JSON.stringify(obj, (key, value) =>
    // stringify functions with their source, converting CRLF.
    //
    // NOTE If you strip CRLF here, any comment in the serialized function will
    // comment out the rest of the line.
    //
    ((typeof value === 'function') ? value.toString().replace(/\r?\n|\n/g, '\n') : value));
}

function parse(str) {
  return JSON.parse(str, (key, value) => {
    if (typeof value !== 'string') { return value; }
    return (value.substring(0, 8) === 'function') ? eval(`(${value})`) : value;
  });
}

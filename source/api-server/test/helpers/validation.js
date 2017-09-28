/**
 * Helper stuff for validating objects against schemas.
 */

const ErrorIds = require('components/errors').ErrorIds;
const Action = require('../../src/schema/Action');
const encryption = require('components/utils').encryption;
const Validator = require('z-schema');
const validator = new Validator();
const { assert, should, expect } = require('chai');
const util = require('util');
const _ = require('lodash');

/**
 * Expose common JSON schemas.
 */
var schemas = exports.schemas = {
  access: require('../../src/schema/access'),
  event: require('../../src/schema/event'),
  followedSlice: require('../../src/schema/followedSlice'),
  stream: require('../../src/schema/stream'),
  user: require('../../src/schema/user'),
  errorResult: {
    type: 'object',
    additionalProperties: false,
    properties: {
      'error': require('../../src/schema/methodError'),
      'meta': {type: 'object'}
    },
    required: [ 'error', 'meta' ]
  }
};

/**
 * Checks the given response matches basic expectations.
 *
 * @param {Object} response
 * @param {Object} expected Properties (mandatory unless mentioned):
 *    - {Number} status
 *    - {Object} schema
 *    - {Function} sanitizeFn A data cleanup function to apply before checking response body
 *    - {String} sanitizeTarget The key of the response body property to apply the sanitize fn to
 *    - {Object} body Optional
 * @param {Function} done Optional
 */
exports.check = function (response, expected, done) {
  response.statusCode.should.eql(expected.status);

  // ignore common metadata
  var meta = response.body.meta;
  delete response.body.meta;

  if (expected.schema) {
    checkJSON(response, expected.schema);
  }
  if (expected.sanitizeFn) {
    expect(expected.sanitizeTarget).to.exist;
    expected.sanitizeFn(response.body[expected.sanitizeTarget]);
  }
  if (expected.body) {
    assert.deepEqual(response.body, expected.body);
  }

  // restore ignored metadata
  response.body.meta = meta;

  if (done) { done(); }
};

/**
 * Specific check for errors.
 *
 * @param {Object} response
 * @param {Object} expected Must have `error` object with properties (mandatory unless mentioned):
 *    - {Number} status
 *    - {String} id
 *    - {Object} data Optional
 * @param {Function} done Optional
 */
exports.checkError = function (response, expected, done) {
  response.statusCode.should.eql(expected.status);
  checkJSON(response, schemas.errorResult);
  var error = response.body.error;
  error.id.should.eql(expected.id);
  if (expected.data) {
    should(error.data).exist;
    error.data.should.eql(expected.data);
  }
  if (done) { done(); }
};

function checkJSON(response, schema) {
  /*jshint -W030 */
  response.should.be.json;
  checkSchema(response.body, schema);
}

/**
 * Checks the given data against the given JSON schema.
 *
 * @param data
 * @param {Object} schema
 */
function checkSchema(data, schema) {
  validator.validate(data, schema).should.equal(true,
      util.inspect(validator.getLastErrors(), {depth: 5}));
}
exports.checkSchema = checkSchema;

/**
 * Checks the given item against its 'STORE' schema identified by the given name.
 *
 * @param {Object} item
 * @param {String} schemaName
 */
exports.checkStoredItem = function (item, schemaName) {
  checkSchema(item, schemas[schemaName](Action.STORE));
};

function checkMeta(parentObject) {
  expect(parentObject.meta).to.exist;
  parentObject.meta.apiVersion.should.eql(require('../../package.json').version);
  parentObject.meta.serverTime.should.match(/^\d+\.?\d*$/);
}
exports.checkMeta = checkMeta;

/**
 * Specific error check for convenience.
 */
exports.checkErrorInvalidParams = function (res, done) {
  expect(res.statusCode).to.equal(400);

  checkJSON(res, schemas.errorResult);
  res.body.error.id.should.eql(ErrorIds.InvalidParametersFormat);
  expect(res.body.error.data).to.exist; // expect validation errors

  done();
};

/**
 * Specific error check for convenience.
 */
exports.checkErrorInvalidAccess = function (res, done) {
  expect(res.statusCode).to.equal(401);

  checkJSON(res, schemas.errorResult);
  res.body.error.id.should.eql(ErrorIds.InvalidAccessToken);

  done();
};

/**
 * Specific error check for convenience.
 */
exports.checkErrorForbidden = function (res, done) {
  expect(res.statusCode).to.equal(403);

  checkJSON(res, schemas.errorResult);
  res.body.error.id.should.eql(ErrorIds.Forbidden);

  done();
};

/**
 * Checks equality between the given objects, allowing for a slight difference in `created` and
 * `modified` times.
 * If `expected` has no change tracking properties, those in `actual` are ignored in the check
 * (warning: removes tracking properties from `actual`).
 * Recurses to sub-objects in `children` if defined (warning: removes `children` properties from
 * `actual` and `expected` if not empty).
 */
var checkObjectEquality = exports.checkObjectEquality = function (actual, expected) {
  var skippedProps = [];

  if (expected.created) {
    checkApproxTimeEquality(actual.created, expected.created);
  }
  skippedProps.push('created');

  if (! expected.createdBy) {
    skippedProps.push('createdBy');
  }

  if (expected.modified) {
    checkApproxTimeEquality(actual.modified, expected.modified);
  }
  skippedProps.push('modified');

  if (expected.deleted) {
    checkApproxTimeEquality(actual.deleted, expected.deleted);
  }
  skippedProps.push('deleted');

  if (! expected.modifiedBy) {
    skippedProps.push('modifiedBy');
  }

  if (expected.children) {
    expect(actual.children).to.exist;
    should.equal(actual.children.length, expected.children.length);
    for (var i = 0, n = expected.children.length; i < n; i++) {
      checkObjectEquality(actual.children[i], expected.children[i]);
    }
  }
  skippedProps.push('children');


  if (expected.attachments) {
    expect(actual.attachments).to.exist;
    should.equal(actual.attachments.length, expected.attachments.length);
    var attachmentsNumber = actual.attachments.length;
    expected.attachments.forEach( function (attachmentFromExpected) {
      actual.attachments.forEach( function (attachmentFromActual) {
        if (attachmentFromActual.id === attachmentFromExpected.id) {
          checkObjectEquality(attachmentFromActual, attachmentFromExpected);
          attachmentsNumber = attachmentsNumber - 1;
        }
      });
    });
    should.equal(attachmentsNumber, 0);
  }
  skippedProps.push('attachments');

  _.omit(actual, skippedProps).should.eql(_.omit(expected, skippedProps));
};

function checkApproxTimeEquality(actual, expected) {
  Math.round(actual).should.eql(Math.round(expected),
      '"modified" time');
}

/**
 * @param response
 * @param {Array} expectedHeaders Each item must have name and value properties.
 */
exports.checkHeaders = function (response, expectedHeaders) {
  expectedHeaders.forEach(function (expected) {
    var value = response.headers[expected.name.toLowerCase()];
    expect(value).to.exist;
    if (expected.value) {
      value.should.eql(expected.value);
    }
    if (expected.valueRegExp) {
      value.should.match(expected.valueRegExp);
    }
  });
};

/**
 * Checks file read token validity for the event(s)' attachments.
 *
 * @param {Object|Array} eventOrEvents
 * @param access
 * @param secret
 */
exports.checkFilesReadToken = function (eventOrEvents, access, secret) {
  if (Array.isArray(eventOrEvents)) {
    eventOrEvents.forEach(checkEvent);
  } else {
    checkEvent(eventOrEvents);
  }

  function checkEvent(evt) {
    if (! evt.attachments) { return; }

    evt.attachments.forEach(function (att) {
      att.readToken.should.eql(encryption.fileReadToken(att.id, access, secret));
    });
  }
};

/**
 * Strips off per-client read-only properties such as `attachments[].readToken`.
 * Does nothing if no event is passed.
 *
 * @param {Object} event
 */
exports.sanitizeEvent = function (event) {
  if (! event || ! event.attachments) { return; }

  event.attachments.forEach(function (att) {
    delete att.readToken;
  });
  return event;
};

/**
 * Array counterpart of `sanitizeEvent`.
 *
 * @param {Array} events
 */
exports.sanitizeEvents = function (events) {
  if (! events) { return; }

  events.forEach(exports.sanitizeEvent);
  return events;
};

/**
 * Strips off items deletions from the given array.
 *
 * @param {Array} items
 * @returns {Array}
 */
exports.removeDeletions = function (items) {
  return items.filter(function (e) { return ! e.deleted; });
};

/**
 * Strips off items history from the given array
 *
 * @param {Array} items
 * @returns {Array}
 */
exports.removeHistory = function (items) {
  return items.filter(function (e) { return ! e.headId; });
};

/**
 * Strips off items deletions and history from the given array
 *
 * @param {Array} items
 * @returns {Array}
 */
exports.removeDeletionsAndHistory = function (items) {
  return items.filter(function (e) { return ! (e.deleted || e.headId); });
};

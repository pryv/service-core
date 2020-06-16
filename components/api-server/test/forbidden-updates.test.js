/* global describe, it */

const should = require('should');
const async = require('async');
const chai = require('chai');
const commonFns = require('../src/methods/helpers/commonFunctions');
const streamSchema = require('../src/schema/stream');
const eventsSchema = require('../src/schema/event');
const accessesSchema = require('../src/schema/access');

const { assert } = chai;

describe('methods/helpers/commonFunctions.js: catchForbiddenUpdate(schema)', () => {
  describe('with streams schema', () => {
    const protectedFields = ['id', 'children', 'created', 'createdBy', 'modified', 'modifiedBy'];

    it('[DMGV] must throw a forbidden error if "ignoreProtectedFieldUpdates" is null', (done) => {
      testForbiddenUpdate(streamSchema, protectedFields, null, done);
    });

    it('[Z51K] must throw a forbidden error if "ignoreProtectedFieldUpdates" is false', (done) => {
      testForbiddenUpdate(streamSchema, protectedFields, false, done);
    });

    it('[EUKL] must not throw any error if "ignoreProtectedFieldUpdates" is true but print a warn log', (done) => {
      testForbiddenUpdate(streamSchema, protectedFields, true, done);
    });
  });

  describe('with events schema', () => {
    const protectedFields = ['id', 'attachments', 'created', 'createdBy', 'modified', 'modifiedBy'];

    it('[0RQM] must throw a forbidden error if "ignoreProtectedFieldUpdates" is null', (done) => {
      testForbiddenUpdate(eventsSchema, protectedFields, null, done);
    });

    it('[6TK9] must throw a forbidden error if "ignoreProtectedFieldUpdates" is false', (done) => {
      testForbiddenUpdate(eventsSchema, protectedFields, false, done);
    });

    it('[IJ4M] must not throw any error if "ignoreProtectedFieldUpdates" is true but print a warn log', (done) => {
      testForbiddenUpdate(eventsSchema, protectedFields, true, done);
    });
  });

  describe('with accesses schema', () => {
    const protectedFields = ['id', 'token', 'type', 'lastUsed', 'created', 'createdBy', 'modified', 'modifiedBy'];

    it('[GP6C] must throw a forbidden error if "ignoreProtectedFieldUpdates" is null', (done) => {
      testForbiddenUpdate(accessesSchema, protectedFields, null, done);
    });

    it('[MUC0] must throw a forbidden error if "ignoreProtectedFieldUpdates" is false', (done) => {
      testForbiddenUpdate(accessesSchema, protectedFields, false, done);
    });

    it('[QGDA] must not throw any error if "ignoreProtectedFieldUpdates" is true but print a warn log', (done) => {
      testForbiddenUpdate(accessesSchema, protectedFields, true, done);
    });
  });

  function testForbiddenUpdate(schema, protectedFields, ignoreProtectedFieldUpdates, done) {
    async.eachSeries(
      protectedFields,
      (protectedField, stepDone) => {
        // Here we fake a logger to test that a warning is logged in non-strict mode
        let warningLogged = false;
        const logger = {
          warn(msg) {
            should(ignoreProtectedFieldUpdates).be.true();
            should(msg.indexOf('Forbidden update was attempted on the following protected field(s)') >= 0).be.true();
            should(msg.indexOf('Server has "ignoreProtectedFieldUpdates" turned on: Fields are not updated, but no error is thrown.') >= 0).be.true();
            should(msg.indexOf(protectedField) >= 0).be.true();

            warningLogged = true;
          },
        };
        const catchForbiddenUpdate = commonFns.catchForbiddenUpdate(schema('update'), ignoreProtectedFieldUpdates, logger);
        const forbiddenUpdate = { update: {} };
        forbiddenUpdate.update[protectedField] = 'forbidden';
        catchForbiddenUpdate(null, forbiddenUpdate, null, (err) => {
          // Strict mode: we expect a forbidden error
          if (!ignoreProtectedFieldUpdates) {
            should.exist(err);
            should(err.id).be.equal('forbidden');
            should(err.httpStatus).be.equal(403);
            stepDone();
          }
          // Non-strict mode: we do not expect an error but a warning log
          else {
            if (err != null) return stepDone(err);

            // From here we expect a warning log to be triggered (see logger above).
            // We throw an explicit error if this is not the case
            assert.isTrue(warningLogged, 'Warning was not logged.');

            return stepDone();
          }
        });
      },
      done,
    );
  }
});

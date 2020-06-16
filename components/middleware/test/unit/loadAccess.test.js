// @flow

const should = require('should');
const bluebird = require('bluebird');
const loadAccessMiddleware = require('../../src/loadAccess');

/* globals describe, it, beforeEach */

describe('loadAccess middleware', () => {
  const loadAccess = loadAccessMiddleware();

  // Mocking request and response context/headers
  let req; let
      res;
  beforeEach(async () => {
    req = {
      auth: 'invalid',
      context: {
        access: {},
        retrieveExpandedAccess: () => {
          if (req.auth === 'valid') {
            req.context.access = { name: 'Valid access', id: 'validAccess' };
          } else if (req.auth === 'expired') {
            req.context.access = { name: 'Expired access', id: 'expiredAccess' };
            throw new Error('Access is expired but should still be loaded!');
          } else {
            delete req.context.access;
          }
        },
      },
    };
    res = {
      headers: {},
      header: (key, value) => {
        res.headers[key] = value;
      },
    };
  });

  describe('when an access is actually loaded in request context', () => {
    it('[OD3D] should add the access id as Pryv-access-id header if token is valid', async () => {
      req.auth = 'valid';
      // FLOW Mocking req and res
      await bluebird.fromCallback((cb) => loadAccess(req, res, cb));
      should(res.headers['Pryv-Access-Id']).be.eql('validAccess');
    });

    it('[UDW7] should still set the Pryv-access-id header in case of error (e.g. expired token)', async () => {
      req.auth = 'expired';
      try {
        // FLOW Mocking req and res
        await bluebird.fromCallback((cb) => loadAccess(req, res, cb));
      } catch (err) {
        should.exist(err);
        should(res.headers['Pryv-Access-Id']).be.eql('expiredAccess');
      }
    });
  });

  describe('when the access can not be loaded (e.g. invalid token)', () => {
    it('[9E2D] should not set the Pryv-access-id header', async () => {
      req.auth = 'invalid';
      // FLOW Mocking req and res
      await bluebird.fromCallback((cb) => loadAccess(req, res, cb));
      should.not.exist(res.headers['Pryv-Access-Id']);
    });
  });
});

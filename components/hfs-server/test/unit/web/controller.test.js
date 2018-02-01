const should = require('should');
/* global describe, it */

require('../test-helpers');

const controllerFactory = require('../../../src/web/controller');
const controller = controllerFactory({});

const APIError = require('../../../../errors/src/APIError');
const ErrorIds = require('../../../../errors/src/ErrorIds');

describe('Controller', () => {

  describe('storeSeriesData', () => {

    it('should reject queries if the authorization header is missing', (done) => {
      const req = {
        params: {},
        headers: {}
      };

      controller.storeSeriesData(req, {}, (err, res) => {
        should.not.exist(res);
        should.exist(err);
        should(err).be.instanceof(APIError);
        should(err.id).be.equal(ErrorIds.MissingHeader);
        done();
      });
    });

    it('should reject queries if the eventId is missing', (done) => {
      const req = {
        params: {},
        headers: {authorization: 'token'}
      };

      controller.storeSeriesData(req, {}, (err, res) => {
        should.not.exist(res);
        should.exist(err);
        should(err).be.instanceof(APIError);
        should(err.id).be.equal(ErrorIds.InvalidItemId);
        done();
      });
    });

  });
});
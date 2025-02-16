/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const should = require('should');

const controllerFactory = require('../../../src/web/controller');
const controller = controllerFactory({});

const APIError = require('errors/src/APIError');
const ErrorIds = require('errors/src/ErrorIds');

describe('Controller', () => {
  describe('storeSeriesData', () => {
    it('[3BYC] should reject queries if the authorization header is missing', (done) => {
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

    it('[U0WB] should reject queries if the eventId is missing', (done) => {
      const req = {
        params: {},
        headers: { authorization: 'token' }
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

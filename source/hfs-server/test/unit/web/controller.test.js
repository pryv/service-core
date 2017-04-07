'use strict';
// @flow

/* global describe, it */
const { should } = require('../test-helpers');

const controller = require('../../../src/web/controller');

const APIError = require('../../../../errors/src/APIError');
const ErrorIds = require('../../../../errors/src/ErrorIds');

const ServiceNotAvailableError =
  require('../../../../../node_modules/influx/lib/src/pool')
    .ServiceNotAvailableError;

describe('Controller', () => {

  describe('storeSeriesData', () => {

    it('should reject queries if the authorization header is missing', (done) => {
      const req = {
        params: {},
        headers: {}
      };

      controller.storeSeriesData({}, req, {}, (err, res) => {
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

      controller.storeSeriesData({}, req, {}, (err, res) => {
        should.not.exist(res);
        should.exist(err);
        should(err).be.instanceof(APIError);
        should(err.id).be.equal(ErrorIds.InvalidItemId);
        done();
      });
    });

    it('should reject queries if InfluxDB is not ready', (done) => {

      const errorMessage = 'error generated for test';

      const emptyContext = {
        series: {
          get: () => Promise.resolve({
            append: () => Promise.reject(new ServiceNotAvailableError(errorMessage))

          })
        },
        metadata: {
          forSeries: () => {
            return new Promise(
            (resolve, reject) => {
              resolve({
                canWrite: () => {return true;}
              });
            }
          )}
        }
      };

      const req = {
        params: {event_id: 'some-id'},
        headers: {authorization: 'some-token'},
        body: {
          fields: ['timestamp', 'value'],
          points: [[123,1]],
          format: 'flatJSON'
        }
      };

      controller.storeSeriesData(emptyContext, req, {}, (err, res) => {
        should.not.exist(res);
        should.exist(err);
        should.equal(err.id, ErrorIds.ApiUnavailable);
        should.equal(err.message, errorMessage);
        should.equal(err.httpStatus, 503);
        done();
      });
    });
  });



});
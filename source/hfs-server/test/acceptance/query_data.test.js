'use strict';
// @flow

// Tests pertaining to storing data in a hf series.

/* global describe, it, beforeEach */
const {settings} = require('./test-helpers');
const request = require('supertest');
const should = require('should');
const memo = require('memo-is');
const {ErrorIds} = require('../../../errors');

const Application = require('../../src/Application');

import type {MetadataRepository} from '../../src/metadata_cache';

describe('Querying data from a HF series', () => {

  describe('GET /events/EVENT_ID/series', () => {
    const application = memo().is(() => new Application().init(settings));
    const context = memo().is(() => application().context);
    const server = memo().is(() => application().server);

    const app = memo().is(() => server().setupExpress());

    function produceMetadataLoader(authTokenValid = true): MetadataRepository {
      const seriesMeta = {
        canWrite: function canWrite(): boolean {
          return authTokenValid;
        },
        namespace: () => ['test', 'series1'], // Hard coded, will eventually change
      };
      return {
        forSeries: function forSeries() {
          return Promise.resolve(seriesMeta);
        }
      };
    }

    beforeEach(() => {
      context().metadata = produceMetadataLoader(false);
    });


    it('should refuse a query missing the authorization token', function () {
      return request(app())
        .get('USERNAME/events/some-id/series')
        .expect(403)
        .then((res) => {
          should.exist(res.body.err);
          should.equal(res.body.err.id, ErrorIds.Forbidden);
        });
    });

    it('should refuse a query containing parameters with the wrong format', function() {
      return request(app())
        .get('/USERNAME/events/some-id/series')
        .set('authorization', 'valid-auth')
        .query({
          fromTime: 'hi-i-am-not-a-timestamp',
          toTime: 'i-am-not-a-timestamp-either'})
        .expect(400)
        .then((res) => {
          const err = res.body.error;
          should.equal(err.id, ErrorIds.InvalidParametersFormat);
          should.equal(err.data[0].parameter, 'fromTime');
          should.equal(err.data[1].parameter, 'toTime');
        });
    });

  });
});

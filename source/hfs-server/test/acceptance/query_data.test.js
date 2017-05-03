'use strict';
// @flow

// Tests pertaining to storing data in a hf series.

/* global describe, it, beforeEach */
const { settings, define } = require('./test-helpers');
const request = require('supertest');
const should = require('should');
const memo = require('memo-is');
const { ErrorIds } = require('../../../errors');

const Application = require('../../src/Application');

import type { MetadataRepository } from '../../src/metadata_cache';

describe('Querying data from a HF series', function() {
  // Application, Context and Server are needed for influencing the way
  // authentication works in some of the tests here.
  const application = define(this, () => new Application().init(settings));
  const context = define(this, () => application().context);
  const server = define(this, () => application().server);

  // Express app that we test against.
  const app = define(this, () => server().setupExpress());

  function produceMetadataLoader(authTokenValid = true): MetadataRepository {
    const seriesMeta = {
      canWrite: function canWrite(): boolean {
        return authTokenValid;
      },
      canRead: function canRead(): boolean {
        return authTokenValid;
      },
      namespace: () => ['test', 'series1'] // Hard coded, will eventually change
    };
    return {
      forSeries: function forSeries() {
        return Promise.resolve(seriesMeta);
      }
    };
  }

  beforeEach(() => {
    context().metadata = produceMetadataLoader(true);
  });

  const username = 'USERNAME';

  it('should refuse a query missing the authorization token', function () {
    return request(app())
      .get('/' + username + '/events/some-id/series')
      .expect(400)
      .then((res) => {
        should.exist(res.body.error);
        should.equal(res.body.error.id, ErrorIds.MissingHeader);
      });
  });

  it('should refuse a query containing an unauthorized token', function () {
    context().metadata = produceMetadataLoader(false);
    return request(app())
      .get('/' + username + '/events/some-id/series')
      .set('authorization', 'invalid-auth')
      //.expect(403)
      .expect(403)
      .then((res) => {
        should.exist(res.body.error);
        should.equal(res.body.error.id, ErrorIds.Forbidden);
      });
  });

  it('should refuse a query containing parameters with the wrong format', function () {
    return request(app())
      .get('/' + username + '/events/some-id/series')
      .set('authorization', 'valid-auth')
      .query({
        fromTime: 'hi-i-am-not-a-timestamp',
        toTime: 'i-am-not-a-timestamp-either'
      })
      .expect(400)
      .then((res) => {
        const err = res.body.error;
        should.equal(err.id, ErrorIds.InvalidParametersFormat);
        should.equal(err.data[0].parameter, 'fromTime');
        should.equal(err.data[1].parameter, 'toTime');
      });
  });

});

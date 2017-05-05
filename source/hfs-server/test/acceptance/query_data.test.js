'use strict';
// @flow

// Tests pertaining to storing data in a hf series.

/* global describe, it, beforeEach */
const { settings, define } = require('./test-helpers');
const request = require('supertest');
const should = require('should');
const memo = require('memo-is');
const timestamp = require('unix-timestamp');
const { ErrorIds, factory } = require('../../../errors');

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
      // TODO change when calling to InfluxDB available
      namespace: () => ['test', 'series1']
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

  it('should return an unknown resource error when querying data ' +
    'for an nonexistent event id', function () {
    // TODO modify this using a database fixture and querying an nonexisting event
    const nonexistentEventId = 'nonexistent-event-id';

    context().metadata = {
      forSeries: function forSeries() {
        return Promise.reject(factory.unknownResource('event', nonexistentEventId));
      }
    };

    return request(app())
      .get('/' + username + '/events/' + nonexistentEventId + '/series')
      .set('authorization', 'valid-auth')
      .expect(404)
      .then((res) => {
        should.exist(res.body.error);
        should.equal(res.body.error.id, ErrorIds.UnknownResource);
      });
  });

  it('should return an unexpected error when querying for the ' +
    'event metadata fails', function () {
    context().metadata = {
      forSeries: function forSeries() {
        return Promise.reject({error: 'main-storage-error'});
      }
    };

    return request(app())
      .get('/' + username + '/events/some-id/series')
      .set('authorization', 'valid-auth')
      .expect(500)
      .then((res) => {
        should.exist(res.body.error);
        should.equal(res.body.error.id, ErrorIds.UnexpectedError);
      });
  });

  it('should refuse a query containing an unauthorized token', function () {
    context().metadata = produceMetadataLoader(false);
    return request(app())
      .get('/' + username + '/events/some-id/series')
      .set('authorization', 'invalid-auth')
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

  it('should refuse a query when toTime is before fromTime', function () {
    return request(app())
      .get('/' + username + '/events/some-id/series')
      .set('authorization', 'valid-auth')
      .query({
        fromTime: timestamp.now(),
        toTime: timestamp.now('-1h'),
      })
      .expect(400)
      .then((res) => {
        const err = res.body.error;
        should.equal(err.id, ErrorIds.InvalidParametersFormat);
        should.equal(err.data[0].message, 'Parameter fromTime is bigger than toTime');
      });
  });

});

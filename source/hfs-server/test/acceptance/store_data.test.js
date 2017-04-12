'use strict';
// @flow

// Tests pertaining to storing data in a hf series. 

/* global describe, it, beforeEach, afterEach */
const bluebird = require('bluebird');
const should = require('should');
const request = require('supertest');
const R = require('ramda');
const cuid = require('cuid');

const { settings, produceMongoConnection, define } = require('./test-helpers');
const databaseFixture = require('../support/database_fixture');

const Application = require('../../src/Application');

import type {MetadataRepository} from '../../src/metadata_cache';
import type {Response} from 'supertest';

describe('Storing data in a HF series', function() {
  const application = define(this, () => bluebird.resolve(
    new Application().init(settings))); 
  const context = define(this, () => application().context); 
  const server = define(this, () => application().server); 

  const app = define(this, () => server().setupExpress());

  describe('Use Case: Store data in InfluxDB', function () {
    const database = produceMongoConnection(); 
    
    const userName = define(this, () => cuid());
    const eventId = define(this, () => cuid());
    const accessToken = define(this, () => cuid());

    const pryv = databaseFixture(database, this);
    const user = define(this, () => {
      return pryv.user(userName(), {}, function (user) {
        user.stream({id: cuid()}, function (stream) {
          stream.event({id: eventId()});
        });

        user.access({token: accessToken(), type: 'personal'});
        user.session(accessToken());
      });
    });
    afterEach(function () {
      pryv.clean(); 
    });
    
    it('should store data correctly', function () {
      // store data
      // verify db existence in InfluxDB
      // verify content in InfluxDB
    });
  });
  
  describe('POST /events/EVENT_ID/series', function() {
    const EVENT_ID = 'EVENTID';
    
    // TODO Worry about deleting data that we stored in earlier tests.
    
    function storeData(data): Response {
      const response = request(app())
        .post(`/USERNAME/events/${EVENT_ID}/series`)
        .set('authorization', 'AUTH_TOKEN')
        .send(data);
        
      return response;
    }
    function queryData(): Promise<Object> {
      let response = request(app())
        .get(`/USERNAME/events/${EVENT_ID}/series`)
        .query({
          fromTime: '1481677844', 
          toTime: '1481677850',
        });

      return response
        .expect(200)
        .then((res) => {
          should(res.body.elementType).be.instanceof(String);
          return res.body;
        });
    }
    
    function produceMetadataLoader(authTokenValid=true): MetadataRepository {
      const seriesMeta = {
        canWrite: function canWrite(): boolean { return authTokenValid; },
      };
      return {
        forSeries: function forSeries() { return Promise.resolve(seriesMeta); }
      };
    }
    function produceData() {
      return {
        elementType: 'mass/kg',
        format: 'flatJSON', 
        fields: ['timestamp', 'value'], 
        points: [
          [1481677845, 14.1], 
          [1481677846, 14.2], 
          [1481677847, 14.3], 
        ]
      };
    }

    it.skip('should reject non-JSON bodies', function () { });
    
    describe('when bypassing authentication (succeed always)', function () {
      // Bypass authentication check: Succeed always
      beforeEach(function () {
        context().metadata = produceMetadataLoader();
      });
      
      it('stores data into InfluxDB', function() {
        const data = produceData(); 
        
        return storeData(data)
          .expect(200)
          .then(queryData)
          .then((response) => {
            // Verify HTTP response content
            should(response).not.be.empty(); 
            
            should(response.fields).be.eql(['timestamp', 'value']);
            
            const pairEqual = ([given, expected]) => 
              should(given).be.eql(expected);
              
            should(response.points.length).be.eql(data.points.length);
            R.all(pairEqual, R.zip(response.points, data.points));
          });
      });

      describe('when request is malformed', function () {
        malformed('format is not flatJSON', {
          elementType: 'mass/kg',
          format: 'JSON', 
          fields: ['timestamp', 'value'], 
          points: [
            [1481677845, 14.1], 
            [1481677846, 14.2], 
            [1481677847, 14.3], 
          ]
        });
        malformed('matrix is not square - not enough fields', {
          elementType: 'mass/kg',
          format: 'flatJSON', 
          fields: ['timestamp', 'value'], 
          points: [
            [1481677845, 14.1], 
            [1481677846], 
            [1481677847, 14.3], 
          ]
        });
        malformed('value types are not all valid', {
          elementType: 'mass/kg',
          format: 'flatJSON', 
          fields: ['timestamp', 'value'], 
          points: [
            [1481677845, 14.1], 
            [1481677846, 'foobar'], 
            [1481677847, 14.3], 
          ]
        });
        malformed('missing timestamp column', {
          elementType: 'mass/kg',
          format: 'flatJSON', 
          fields: ['value'], 
          points: [
            [14.1], 
            [13.2], 
            [14.3], 
          ]
        });
        malformed('missing value column for a simple input', {
          elementType: 'mass/kg',
          format: 'flatJSON', 
          fields: ['timestamp'], 
          points: [
            [1481677845], 
            [1481677846], 
            [1481677847], 
          ]
        });
        
        function malformed(text, data) {
          it(`should be rejected (${text})`, function () {
            return storeData(data).expect(400)
              .then((res) => {
                const error = res.body.error; 
                should(error.id).be.eql('invalid-request-structure');
              });
          });
        }
      });
    });
    describe('when authentication fails', function () {
      // Bypass authentication check: Fail always
      beforeEach(function () {
        context().metadata = produceMetadataLoader(false); 
      });

      it('refuses invalid/unauthorized accesses', function () {
        const data = produceData(); 
        
        return storeData(data)
          .expect(403)
          .then((res) => {
            const error = res.body.error; 
            should(error.id).be.eql('forbidden');
            should(error.message).be.instanceof(String);
          });
      });
    });
  }); 
  describe('GET /events/EVENT_ID/series', function () {
    it.skip('should query data from the influx store', function () { });
    it.skip('should return correctly for empty sets', function () { });
  });
});

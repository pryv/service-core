// @flow

require('./test-helpers');

/* global describe, it, before, after */
const supertest = require('supertest');
const chai = require('chai');
const assert = chai.assert; 

const cuid = require('cuid');

const Settings = require('../src/settings');
const Application = require('../src/application');

const databaseFixture = require('./helpers/database_fixture');
const { SpawnContext, Server, ConditionVariable } = require('./helpers/spawner');


describe('High Frequency:', () => {
  const settings = Settings.load(); 
  const application = new Application(settings);
  
  const fixture = databaseFixture(application.storageLayer.connection);
  after(() => {
    fixture.clean();
  });

  // Create MongoDB database content for the following tests.
  let userId, parentStreamId, eventId, accessToken; 
  before(() => {
    userId = cuid(); 
    parentStreamId = cuid(); 
    eventId = cuid(); 
    accessToken = cuid(); 

    fixture.user(userId, {}, function (user) {
      user.stream({id: parentStreamId}, function (stream) {
        stream.event({
          id: eventId, 
          type: 'mass/kg'});
      });

      user.access({token: accessToken, type: 'personal'});
      user.session(accessToken);
    });
  });
  
  // Spawn an api-server for our tests to run against. 
  let context, server, request; 
  before(async () => {
    context = new SpawnContext(); 
    server = await context.spawn(); 
    
    request = supertest(server.baseUrl);
  });
  // Teardown context
  after(async () => {
    await context.shutdown(); 
  });
  
  describe('POST /events/:event_id/series', () => {
    it('stores data to influxdb', async function() {
      const data = {
        format: 'flatJSON',
        fields: ['timestamp', 'value'], 
        points: [ 
          [1481677845, 80.3],
        ]
      };

      const response = await request.post(`/events/${eventId}/series`, data);
      assert.strictEqual(response.statusCode, 200); 
    });
  });
});


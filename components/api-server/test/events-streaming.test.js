/*global describe, before, beforeEach, it */


const cuid = require('cuid');
const assert = require('chai').assert;

const { produceMongoConnection, context } = require('./test-helpers');
const { databaseFixture } = require('components/test-helpers');
const itemDeletion = require('../src/schema/itemDeletion');

const http = require('http');

describe('events streaming', function () {
  this.timeout(60 * 2 * 1000);

  let mongoFixtures;
  before(async function () {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  });

  let apiServer, webhooksApp, webhooksService;
  before(async function () {
    apiServer = await context.spawn();
  });

  let user, username,
    streamId, appAccessToken;
  before(async function () {
    username = 'test-stream';
    streamId = 'test';
    appAccessToken = cuid();
    user = await mongoFixtures.user(username, {});
    await user.stream({
      id: streamId,
    });
    await user.access({
      type: 'app', token: appAccessToken,
      permissions: [{
        streamId: '*',
        level: 'manage',
      }]
    });
    // load 10'000 events
    console.log('test events streaming inserting 1000 events');
    for (let i = 0; i < 1000; i++) {
      let res = await user.event({
        streamIds: [streamId],
        type: 'count/step',
        content: 1
      });
    }
  });

  after(async function () {
    await apiServer.stop();
  });

  it('Streams events', function (done) { 
    var options = {
      host: apiServer.host,
      port: apiServer.port,
      path: '/' + username + '/events?limit=10000&auth=' + appAccessToken,
      method: 'GET'
    };

    const req = http.request(options, function (res) {
      console.log('STATUS: ' + res.statusCode);
      console.log('HEADERS: ' + JSON.stringify(res.headers));
      res.setEncoding('utf8');
      let jsonString = "";
      res.on('data', function (chunk) {
        console.log('BODY: ');
        jsonString += chunk;
      });
      res.on('end', () => {
        console.log('DONE: ', JSON.parse(jsonString).events.length);
        done();
      });
    }).end();

  });

});
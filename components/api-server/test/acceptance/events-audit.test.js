/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, it*/

const { getConfig } = require('@pryv/boiler');
const { databaseFixture } = require('test-helpers');
const { produceMongoConnection, context } = require('api-server/test/test-helpers');
const charlatan = require('charlatan');
const cuid = require('cuid');
const assert = require('chai').assert;
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

describe('Audit logs events', () => {

  let config;
  let mongoFixtures;
  let server;
  let username;
  let auditToken, actionsToken;
  let streamId;
  before(async () => {
    config = await getConfig();
  
    mongoFixtures = databaseFixture(await produceMongoConnection());

    username = cuid();
    auditToken = 'audit-token';
    actionsToken = 'actions-token';
    personalToken = cuid();
    streamId = cuid();
    const user = await mongoFixtures.user(username);
    const stream = await user.stream({ id: streamId, name: charlatan.Lorem.word()});
    const event = await stream.event({
      type: 'language/iso-639-1',
      content: charlatan.Lorem.characters(2),
    });
    await user.access({
      permissions: [{
        streamId: '*',
        level: 'manage',
      }],
      token: actionsToken,
      type: 'app',
    })
    await user.access({
      permissions: [{
        streamId: ':_audit:',
        level: 'read',
      }],
      token: auditToken,
      type: 'app',
    });
    await user.access({
      type: 'personal',
      token: personalToken,
    });
    await user.session(personalToken);

    server = await context.spawn({ 
      dnsLess: { isActive: true }, // so updating account streams does not notify register
      audit: {
        active: true,
        storage: {
          filter: {
            methods: {
              include: ['all'],
              exclude: []
            }
          }
        }
      },
      syslog: {
        filter: {
          methods: {
            exclude: ['all'],
            include: [],
          }
        }
      },
    });

    await post('/events', { streamIds: [stream.attrs.id], type: 'note/txt', content: charlatan.Lorem.text()}, {}, actionsToken);
    await get('/events', { trashed: false }, actionsToken);
  });

  after(async () => {
    await server.stop();
    await mongoFixtures.clean();
    config.injectTestConfig({});
  });

  async function post(path, payload, query, token = auditToken) {
    return await server.request()
      .post('/' + username + path)
      .set('Authorization', token)
      .set('Content-Type', 'application/json')
      .send(payload);
  }
  async function get(path, query, token = auditToken) {
    return await server.request()
      .get('/' + username + path)
      .set('Authorization', token)
      .query(query);
  }
  async function put(path, payload, query) {
    return await server.request()
      .put(path)
      .set('Authorization', token)
      .query(query)
      .send(payload);
  }
  async function del(path, query) {
    return await server.request()
      .del(path)
      .set('Authorization', token)
      .query(query);
  }


  describe('GET /events', () => {

    it('[0BK7] must not return null values', async () => {
      const res = await get('/events', { streams: [':_audit:action-events.get']}, personalToken);
      const events = res.body.events;
      const event = events[0];
      for (const [key, val] of Object.entries(event)) {
        assert.isNotNull(val, `"null" property ${key} of event is present.`);
      }
    });
    it('[VBV0] must not return "auth" in "content:query"', async () => {
      await get('/events', { auth: actionsToken }, null);
      const res = await get('/events', { streams: [':_audit:action-events.get']}, personalToken);
      const event = res.body.events[0];
      console.log('got', event);
      assert.notProperty(event.content.query, 'auth', 'token provided in query is present.');
    });
    it('[SB29] must not return "data" in "error" if its is null', async () => {
      await get('/events', {}, 'invalid-token');
      const res = await get('/events', { streams: [':_audit:action-events.get']}, personalToken);
      const event = res.body.events[0];
      console.log('got', event);
      assert.exists(event.content.error);
      assert.notExists(event.content.data);
    });
    it('[3UVW] must not display expanded streams and streamsQuery parameter, but show them as they were provided in the request', async () => {
      await get('/events', { streams: [streamId] }, actionsToken)
      const res = await get('/events', { streams: [':_audit:action-events.get']}, personalToken);
      const event = res.body.events[0];
      console.log('got', event);
      assert.notExists(event.content.query.streamsQuery);

    }); // actually, maybe it's not the case
    it('[R8MS] must escape special characters', async () => {
      // makes server crash
      const res = await get('/events', { streams: [':_audit:action-events.get"']}, personalToken); // trailing " (quote) in streamId parameter
      assert.equal(res.status, 400, 'status should be 400');
    });
  });
});
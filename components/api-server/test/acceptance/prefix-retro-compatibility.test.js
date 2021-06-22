/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
/*global describe, before, it*/

const { getConfig } = require('@pryv/boiler');
const { databaseFixture } = require('test-helpers');
const { produceMongoConnection, context } = require('../test-helpers');
const charlatan = require('charlatan');
const cuid = require('cuid');
const assert = require('chai').assert;

describe('(System stream id) prefix retro-compatibility', () => {

  let config;
  let mongoFixtures;
  let server;
  let username;
  let token;
  let eventId;
  let streamId;
  let accessId;
  before(async () => {
    // activate retro-compat setting
    config = await getConfig();
    config.injectTestConfig({ systemStreams: { prefix: { isRetroCompatibilityActivated: true } } });
  
    mongoFixtures = databaseFixture(await produceMongoConnection());
    server = await context.spawn();

    username = cuid();
    token = cuid();
    streamId = cuid();
    const user = await mongoFixtures.user(username);
    const stream = await user.stream({ id: streamId }, () => {});
    const event = await stream.event({
      streamId,
      type: 'note/txt',
      content: charlatan.Lorem.sentence(),
    });
    eventId = event.attrs.id;
    await user.access({ token, type: 'personal' });
    await user.session(token);
  });

  after(async () => {
    await server.stop();
    await mongoFixtures.clean();
    config.injectTestConfig({});
  });

  function checkOldPrefix(streamId) {
    const DOT = '.';
    const PRYV_PREFIX = ':_system:';
    const CUSTOMER_PREFIX = ':system:';
    assert.isTrue(streamId.startsWith(DOT), `streamId "${streamId}" does not start with "${DOT}"`);
    assert.isFalse(streamId.startsWith(PRYV_PREFIX), `streamId "${streamId}" starts with "${PRYV_PREFIX}"`);
    assert.isFalse(streamId.startsWith(CUSTOMER_PREFIX), `streamId "${streamId}" starts with "${CUSTOMER_PREFIX}"`);
  }

  // for all use cases, make double one with retro-compatibility breaking parameter
  describe('events', () => {
    it('must return old prefixes in events.get', async () => {
      const res = await server.request()
        .get(`/${username}/events`)
        .set('Authorization', token);
      for (const event of res.body.events) {
        checkOldPrefix(event.streamId);
      }
    });
    it('must accept old prefixes in events.get', () => {

    });
    it('must return old prefixes in events.getOne', () => {

    });
    it('must accept old prefixes in events.create', () => {

    });
    it('must accept old prefixes in events.update', () => {

    });
    it('must return old prefixes in events.delete', () => {

    });
  });
  describe('streams', () => {
    it('must return old prefixes in streams.get', () => {

    });
    it('must accept old prefixes in streams.get', () => {

    });
    it('must accept old prefixes in streams.create', () => {

    });
    it('must accept old prefixes in streams.update', () => {

    });
    it('must return old prefixes in streams.delete', () => {

    });
  });
  describe('accesses', () => {
    it('must return old prefixes in accesses.get', () => {

    });
    it('must accept old prefixes in accesses.create', () => {

    });
  });
  
});
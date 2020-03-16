/*global describe, it, before, after */

const cuid = require('cuid');
const chai = require('chai');
const assert = chai.assert;
const charlatan = require('charlatan');

const { databaseFixture } = require('components/test-helpers');
const { produceMongoConnection, context } = require('./test-helpers');

describe('permissions create-only level', () => {
  let mongoFixtures;
  before(async function() {
    mongoFixtures = databaseFixture(await produceMongoConnection());
  });
  after(() => {
    mongoFixtures.clean();
  });

  let user,
      username,
      streamParentId,
      createOnlyStreamId,
      streamOutId,
      readAccessId,
      createOnlyToken,
      coWithReadParentToken,
      coWithContributeParentToken,
      masterToken,
      createOnlyEventId,
      eventOutId;

  before(() => {
    username = cuid();
    readAccessId = cuid();
    createOnlyToken = cuid();
    coWithReadParentToken = cuid();
    coWithContributeParentToken = cuid();
    masterToken = cuid();
    streamParentId = cuid();
    createOnlyStreamId = cuid();
    streamOutId = cuid();
    createOnlyEventId = cuid();
    eventOutId = cuid();
  });

  let server;
  before(async () => {
    server = await context.spawn();
  });
  after(() => {
    server.stop();
  });

  before(async () => {
    user = await mongoFixtures.user(username, {});
    const streamParent = await user.stream({
      id: streamParentId,
      name: 'Does not matter at all'
    });
    const createOnlyStream = await user.stream({
      parentId: streamParentId,
      id: createOnlyStreamId,
      name: 'Does not matter',
      singleActivity: true
    });
    const streamOut = await user.stream({
      id: streamOutId,
      name: 'Does not matter either'
    });
    await user.access({
      type: 'shared',
      id: readAccessId,
      permissions: [
        {
          streamId: createOnlyStreamId,
          level: 'read'
        }
      ]
    });
    await user.access({
      type: 'app',
      token: createOnlyToken,
      permissions: [
        {
          streamId: createOnlyStreamId,
          level: 'create-only'
        }
      ]
    });
    await user.access({
      type: 'app',
      token: coWithReadParentToken,
      permissions: [
        {
          streamId: createOnlyStreamId,
          level: 'create-only'
        },
        {
          streamId: streamParentId,
          level: 'read'
        }
      ]
    });
    await user.access({
      type: 'app',
      token: coWithContributeParentToken,
      permissions: [
        {
          streamId: createOnlyStreamId,
          level: 'create-only'
        },
        {
          streamId: streamParentId,
          level: 'contribute'
        }
      ]
    });
    await user.access({
      type: 'app',
      token: masterToken,
      permissions: [
        {
          streamId: '*',
          level: 'manage'
        },
      ]
    });
    await streamParent.event();
    await createOnlyStream.event({
      id: createOnlyEventId,
      duration: null
    });
    await streamOut.event({
      id: eventOutId
    });
  });

  describe('Permissions - create-only level', function () {
    let basePath;
    before(() => {
      basePath = `/${username}/accesses`;
    });

    function reqPath(id) {
      return `${basePath}/${id}`;
    }

    describe('Accesses', function () {
      describe('GET /', function () {

        describe('when using an access with a "create-only" permissions', async function () {
  
          let accesses;
          before(async function () {
            const res = await server.request()
              .get(basePath)
              .set('Authorization', createOnlyToken);
            accesses = res.body.accesses;
          });
          it('should return an empty list', async function () {
            assert.exists(accesses);
            assert.equal(accesses.length, 0);
          });
        });
      });

      describe('POST /', function () {

        describe('when using an access with a "manage" permission', function () {          
          it('should forbid to create accesses with "create-only" permissions for tags', async function () {
            const res = await server
              .request()
              .post(basePath)
              .set('Authorization', masterToken)
              .send({
                type: 'shared',
                name: 'whatever',
                permissions: [
                  {
                    tag: 'whatever',
                    level: 'create-only'
                  }
                ]
              });
            const error = res.body.error;
            assert.exists(error);
            assert.equal(res.status, 403);
            assert.notExists(res.body.access);
          });
        });

        describe('when using an access with a "create-only" permission', function () {
  
          it('should allow to create an access with a "create-only" permissions', async function () {
            const res = await server.request()
              .post(basePath)
              .set('Authorization', masterToken)
              .send({
                type: 'shared',
                name: 'whatever',
                permissions: [{
                  streamId: createOnlyStreamId,
                  level: 'create-only',
                }]
              });
            assert.equal(res.status, 201);
            const access = res.body.access;
            assert.exists(access);
          });
          it('should forbid to create an access with a "read" level permission permission', async function () {
            const res = await server
              .request()
              .post(basePath)
              .set('Authorization', coWithContributeParentToken)
              .send({
                name: charlatan.App.name(),
                permissions: [
                  {
                    streamId: createOnlyStreamId,
                    level: 'read'
                  }
                ]
              });
            const error = res.body.error;
            assert.exists(error);
            assert.equal(res.status, 403);
            assert.notExists(res.body.access);
          });
          it('should forbid to create an access with a "contribute" level permission', async function () {
            const res = await server
              .request()
              .post(basePath)
              .set('Authorization', coWithContributeParentToken)
              .send({
                name: charlatan.App.name(),
                permissions: [
                  {
                    streamId: createOnlyStreamId,
                    level: 'contribute'
                  }
                ]
              });
            const error = res.body.error;
            assert.exists(error);
            assert.equal(res.status, 403);
            assert.notExists(res.body.access);
          });
          it('should forbid to create an access with a "manage" level permission', async function () {
            const res = await server
              .request()
              .post(basePath)
              .set('Authorization', coWithContributeParentToken)
              .send({
                name: charlatan.App.name(),
                permissions: [
                  {
                    streamId: createOnlyStreamId,
                    level: 'manage'
                  }
                ]
              });
            const error = res.body.error;
            assert.exists(error);
            assert.equal(res.status, 403);
            assert.notExists(res.body.access);
          });
        });
      });

      describe('PUT /', function() {
        it('should forbid updating accesses', async function () {
          const res = await server.request()
            .put(reqPath(readAccessId))
            .set('Authorization', createOnlyToken)
            .send({
              clientData: {
                a: 'b',
              },
            });
          // 404 instead of 403 for security reason, to not allow to enumerate accesses.
          assert.equal(res.status, 404);
        });
      });
  
      describe('DELETE /', function () {
        it('should forbid deleting accesses', async function () {
          const res = await server.request()
            .del(reqPath(readAccessId))
            .set('Authorization', createOnlyToken);
          assert.equal(res.status, 403);
        });
      });
    });

  });

  describe('Events', function() {
    let basePath;
    before(() => {
      basePath = `/${username}/events`;
    });

    function reqPath(id) {
      return `${basePath}/${id}`;
    }

    describe('GET /', function() {
      it('should return an empty list when fetching "create-only" streams', async function() {
        const query = {
          streams: [createOnlyStreamId]
        };

        const res = await server
          .request()
          .get(basePath)
          .set('Authorization', createOnlyToken)
          .query(query);
        assert.equal(res.status, 200);
        assert.equal(res.body.events.length, 0);
      });

      it('should return events when fetching "create-only" streams that are children of "read" streams', async function() {
        // TODO return empty list on v2
        const res = await server
          .request()
          .get(basePath)
          .set('Authorization', coWithReadParentToken);
        const events = res.body.events;
        assert.equal(events.length, 1);      
      });

      it('should return events when fetching "create-only" streams that are children of "contribute" streams', async function() {
        // TODO return empty list on v2
        const res = await server
          .request()
          .get(basePath)
          .set('Authorization', coWithContributeParentToken);
        const events = res.body.events;
        assert.equal(events.length, 1);
      });
    });

    describe('POST /', function() {
      it('should forbid creating events for out of scope streams', async function() {
        const params = {
          type: 'test/test',
          streamId: streamOutId
        };

        const res = await server
          .request()
          .post(basePath)
          .set('Authorization', createOnlyToken)
          .send(params);
        assert.equal(res.status, 403);
      });

      it('should allow creating events for "create-only" streams', async function() {
        const params = {
          type: 'test/test',
          streamId: createOnlyStreamId
        };
        const res = await server
          .request()
          .post(basePath)
          .set('Authorization', createOnlyToken)
          .send(params);
        assert.equal(res.status, 201);
      });
    });

    describe('PUT /', function () {
      it('should forbid updating events for "create-only" streams', async function () {
        const params = {
          content: 12
        };
        const res = await server
          .request()
          .put(reqPath(createOnlyEventId))
          .set('Authorization', createOnlyToken)
          .send(params);
        assert.equal(res.status, 403);
      });
      // skipping cases "... streams that are children of "read" streams" & "... streams that are children of "contribute" streams"
      // because they are covered by the GET above
    });
    
    describe('DELETE /', function () {
      it('should forbid deleting events for "create-only" streams', async function () {
        const res = await server
          .request()
          .del(reqPath(createOnlyEventId))
          .set('Authorization', createOnlyToken);
        assert.equal(res.status, 403);
      });
      // skipping cases "... streams that are children of "read" streams" & "... streams that are children of "contribute" streams"
      // because they are covered by the GET above
    });

    describe('POST /stop', function () {
      it('should allow stopping events for "create-only" streams', async function () {
        const res = await server
          .request()
          .post(`${basePath}/stop`)
          .set('Authorization', createOnlyToken)
          .send({ id: createOnlyEventId });
        assert.equal(res.status, 200);
        assert.exists(res.body.stoppedId);
      });
    });
    
  });

  describe('Streams', function() {
    let basePath;
    before(() => {
      basePath = `/${username}/streams`;
    });

    function reqPath(id) {
      return `${basePath}/${id}`;
    }

    describe('GET /', function () {
      it('should only return streams for which permissions are defined', async function () {
        const res = await server
          .request()
          .get(basePath)
          .set('Authorization', createOnlyToken)
          .query({ state: 'all' });
        const streams = res.body.streams;
        assert.equal(streams.length, 1);
        const stream = streams[0];
        assert.equal(stream.id, createOnlyStreamId);
      });
    });

    describe('POST /', function () {
      it('should forbid creating child streams in "create-only" streams', async function () {
        const data = {
          name: charlatan.Lorem.word(),
          parentId: createOnlyStreamId
        };
        const res = await server
          .request()
          .post(basePath)
          .set('Authorization', createOnlyToken)
          .send(data);
        assert.equal(res.status, 403);
      });
    });

    describe('PUT /', function () {
      it('[PCO8] should forbid updating "create-only" streams', async function () {
        const res = await server
          .request()
          .put(reqPath(createOnlyStreamId))
          .set('Authorization', createOnlyToken)
          .send({ name: charlatan.Lorem.word() });
        assert.equal(res.status, 403);
      });
    });

    describe('DELETE /', function () {
      it('[PCO9] should forbid deleting "create-only" streams', async function () {
        const res = await server
          .request()
          .del(reqPath(createOnlyStreamId))
          .set('Authorization', createOnlyToken);
        assert.equal(res.status, 403);
      });
    });

  });

  describe('Webhooks', function () {
    let basePath;
    before(() => {
      basePath = `/${username}/webhooks`;
    });

    function reqPath(id) {
      return `${basePath}/${id}`;
    }

    describe('GET /', function () {
      it('should return an empty list when fetching webhooks', async function () {
        const res = await server
          .request()
          .get(basePath)
          .set('Authorization', createOnlyToken);
        assert.equal(res.status, 200);
        assert.equal(res.body.webhooks.length, 0);
      });
    });

    describe('CREATE /', function() {
      it('should forbid creating webhooks', async function () {
        const res = await server
          .request()
          .post(basePath)
          .set('Authorization', createOnlyToken)
          .send({
            url: charlatan.Internet.url(),
          });
        assert.equal(res.status, 403);
      });
    });

    // skipping UPDATE & DELETE as there is no way to create webhooks in the first place.

  });

});

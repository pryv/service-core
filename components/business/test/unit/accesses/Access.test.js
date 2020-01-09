/*global describe, it, before, after*/

const { assert } = require('chai');
const bluebird = require('bluebird');

const accessStorage = require('components/test-helpers').dependencies.storage
  .user.accesses;
const streamStorage = require('components/test-helpers').dependencies.storage
  .user.streams;
const userStorage = require('components/test-helpers').dependencies.storage
  .users;

const User = require('components/business/src/users').User;
const Access = require('components/business/src/accesses').Access;
const AccessesRepository = require('components/business/src/accesses')
  .Repository;
const Stream = require('components/business/src/streams').Stream;
const StreamsRepository = require('components/business/src/streams').Repository;

describe('Access', function() {
  let accessesRepository = new AccessesRepository(accessStorage, userStorage);
  let streamsRepository = new StreamsRepository(streamStorage, userStorage);

  let user, streams, access;
  let streamsMap = {};

  after(async () => {
    await bluebird.fromCallback(cb => accessStorage.delete(user, {}, cb));
    await bluebird.fromCallback(cb => streamStorage.delete(user, {}, cb));
    await bluebird.fromCallback(cb =>
      userStorage.remove({ username: user.username }, cb)
    );
  });

  describe('canReadStream()', function() {
    before(() => {
      user = new User({
        username: 'bobbb'
      });

      streams = [
        new Stream({
          id: 'a',
          name: 'A'
        }),
        new Stream({
          id: 'aa',
          name: 'AA',
          parentId: 'a'
        }),
        new Stream({
          id: 'ab',
          name: 'AB',
          parentId: 'a'
        })
      ];
      streams.forEach(s => {
        streamsMap[s.id] = s;
      });
    });

    before(async () => {
      for (let i = 0; i < streams.length; i++) {
        await streamsRepository.insertOne(user, streams[i]);
      }
    });

    describe('when the root stream is readable', function() {
      before(async () => {
        access = new Access({
          user: user,
          permissions: [
            {
              scope: {
                streamIds: ['a']
              },
              actions: {
                streams: ['read']
              }
            }
          ],
          accessesRepository: accessesRepository,
          streamsRepository: streamsRepository
        });
        await access.loadPermissions();
      });

      it('should be able to read it', () => {
        assert.isTrue(access.canReadStream(streamsMap.a));
      });
      it('should be able to read its children', () => {
        assert.isTrue(access.canReadStream(streamsMap.aa));
        assert.isTrue(access.canReadStream(streamsMap.ab));
      });
    });

    describe('when a child stream is readable', function() {
      before(async () => {
        access = new Access({
          user: user,
          permissions: [
            {
              scope: {
                streamIds: ['aa']
              },
              actions: {
                streams: ['read']
              }
            }
          ],
          accessesRepository: accessesRepository,
          streamsRepository: streamsRepository
        });

        await access.loadPermissions();
      });

      it('should be able to read it', () => {
        assert.isTrue(access.canReadStream(streamsMap.aa));
      });
      it('should not be able to read root', () => {
        assert.isFalse(access.canReadStream(streamsMap.a));
      });
      it('should not be able to read its sibling', () => {
        assert.isFalse(access.canReadStream(streamsMap.ab));
      });
    });
  });

  describe('canCreateStream()', function() {});

  describe('canUpdateStream()', function() {});

  describe('canDeleteStream()', function() {});
});

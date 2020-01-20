/*global describe, it, before, after*/

const { assert } = require('chai');
const bluebird = require('bluebird');

const accessStorage = require('components/test-helpers').dependencies.storage
  .user.accesses;
const streamStorage = require('components/test-helpers').dependencies.storage
  .user.streams;
const userStorage = require('components/test-helpers').dependencies.storage
  .users;

const treeUtils = require('components/utils/src/treeUtils');

const User = require('components/business/src/users').User;
const Access = require('components/business/src/accesses').Access;
const AccessesRepository = require('components/business/src/accesses')
  .Repository;
const Stream = require('components/business/src/streams').Stream;
const StreamsRepository = require('components/business/src/streams').Repository;

const Actions = require('components/business/src/streams/types').Actions;

describe('Access', function() {
  let accessesRepository = new AccessesRepository(accessStorage, userStorage);
  let streamsRepository = new StreamsRepository(streamStorage, userStorage);

  let user, access;
  

  after(async () => {
    await bluebird.fromCallback(cb => accessStorage.delete(user, {}, cb));
    await bluebird.fromCallback(cb => streamStorage.delete(user, {}, cb));
    await bluebird.fromCallback(cb =>
      userStorage.remove({ username: user.username }, cb)
    );
  });

  describe('streams', function () {

    let streams;
    let streamsMap = {};

    /**
     * Other actions are not tested as they are written similarly to read.
     */
    describe('canReadStream()', function () {
      before(() => {
        user = new User({
          username: 'bobbb'
        });

        streams = [
          new Stream({
            id: 'a',
            name: 'A',
          }),
          new Stream({
            id: 'aa',
            name: 'AA',
            parentId: 'a',
          }),
          new Stream({
            id: 'ab',
            name: 'AB',
            parentId: 'a',
          }),
          new Stream({
            id: 'aaa',
            name: 'AAA',
            parentId: 'aa',
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

      describe('when the root stream is readable', function () {
        before(async () => {
          access = new Access({
            user: user,
            permissions: [
              {
                scope: {
                  streamIds: ['a'],
                },
                actions: {
                  streams: [Actions.READ]
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
          assert.isTrue(access.canReadStream(streamsMap.aaa));
        });
      });

      describe('when a child stream is readable', function () {
        before(async () => {
          access = new Access({
            user: user,
            permissions: [
              {
                scope: {
                  streamIds: ['aa']
                },
                actions: {
                  streams: [Actions.READ]
                }
              }
            ],
            accessesRepository: accessesRepository,
            streamsRepository: streamsRepository
          });

          await access.loadPermissions();
        });

        it('should be able to read it and its children', () => {
          assert.isTrue(access.canReadStream(streamsMap.aa));
          assert.isTrue(access.canReadStream(streamsMap.aaa));
        });
        it('should not be able to read root', () => {
          assert.isFalse(access.canReadStream(streamsMap.a));
        });
        it('should not be able to read its sibling', () => {
          assert.isFalse(access.canReadStream(streamsMap.ab));
        });
      });

      describe('when a deleted stream is readable', function () {
        before(async () => {
          const deletedStream = new Stream({
            id: 'd',
            name: 'D',
            streamsRepository: streamsRepository,
            user: user,
          });
          await streamsRepository.insertOne(user, deletedStream);
          await deletedStream.delete();

          access = new Access({
            user: user,
            permissions: [
              {
                scope: {
                  streamIds: ['d']
                },
                actions: {
                  streams: [Actions.READ]
                }
              }
            ],
            accessesRepository: accessesRepository,
            streamsRepository: streamsRepository
          });

          await access.loadPermissions();
        });

        it('should not be able to read anything', () => {
          assert.isFalse(access.canReadStream(streamsMap.a));
          assert.isFalse(access.canReadStream(streamsMap.aa));
          assert.isFalse(access.canReadStream(streamsMap.ab));
          assert.isFalse(access.canReadStream(streamsMap.aaa));
        });
      });

      describe('when a child is forbidden', function () {
        before(async () => {
          access = new Access({
            user: user,
            permissions: [
              {
                scope: {
                  streamIds: ['a']
                },
                actions: {
                  streams: [Actions.READ]
                }
              },
              {
                scope: {
                  streamIds: ['aa']
                },
                actions: {
                  streams: [Actions.NONREAD]
                }
              }
            ],
            accessesRepository: accessesRepository,
            streamsRepository: streamsRepository
          });

          await access.loadPermissions();
        });

        it('should be able to read the root stream and the other child', () => {
          assert.isTrue(access.canReadStream(streamsMap.a));
          assert.isTrue(access.canReadStream(streamsMap.ab));
        });
        it('should not be able to read the forbidden child and its descendents', () => {
          assert.isFalse(access.canReadStream(streamsMap.aa));
          assert.isFalse(access.canReadStream(streamsMap.aaa));
        });

      });

      describe('when a grandchild is forbidden', function () {
        before(async () => {
          access = new Access({
            user: user,
            permissions: [
              {
                scope: {
                  streamIds: ['a']
                },
                actions: {
                  streams: [Actions.READ]
                }
              },
              {
                scope: {
                  streamIds: ['aaa']
                },
                actions: {
                  streams: [Actions.NONREAD]
                }
              }
            ],
            accessesRepository: accessesRepository,
            streamsRepository: streamsRepository
          });

          await access.loadPermissions();
        });

        it('should be able to read the root stream and the children', () => {
          assert.isTrue(access.canReadStream(streamsMap.a));
          assert.isTrue(access.canReadStream(streamsMap.aa));
          assert.isTrue(access.canReadStream(streamsMap.ab));
        });
        it('should not be able to read the forbidden grandchild', () => {
          assert.isFalse(access.canReadStream(streamsMap.aaa));
        });
      });

      describe('when a parent is forbidden, but its child is allowed', function() {
        before(async () => {
          access = new Access({
            user: user,
            permissions: [
              {
                scope: {
                  streamIds: ['a', 'aaa']
                },
                actions: {
                  streams: [Actions.READ]
                }
              },
              {
                scope: {
                  streamIds: ['aa']
                },
                actions: {
                  streams: [Actions.NONREAD]
                }
              },
            ],
            accessesRepository: accessesRepository,
            streamsRepository: streamsRepository
          });

          await access.loadPermissions();
        });

        it('should be able to read the root stream and its other child', () => {
          assert.isTrue(access.canReadStream(streamsMap.a));
          assert.isTrue(access.canReadStream(streamsMap.ab));
        });
        it('should not be able to read the forbidden child', () => {
          assert.isFalse(access.canReadStream(streamsMap.aa));
        });
        it('should be able to read the grandchild', () => {
          assert.isTrue(access.canReadStream(streamsMap.aaa));
        });
      });
    });

    describe('getReadableStreams()', function () {
      before(() => {
        user = new User({
          username: 'bobbb'
        });

        streams = [
          new Stream({
            id: 'a',
            name: 'A',
          }),
          new Stream({
            id: 'aa',
            name: 'AA',
            parentId: 'a',
          }),
          new Stream({
            id: 'ab',
            name: 'AB',
            parentId: 'a',
          }),
          new Stream({
            id: 'aaa',
            name: 'AAA',
            parentId: 'aa',
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

      before(async () => {
        access = new Access({
          user: user,
          permissions: [
            {
              scope: {
                streamIds: ['ab', 'aaa'],
              },
              actions: {
                streams: [Actions.READ]
              }
            }
          ],
          accessesRepository: accessesRepository,
          streamsRepository: streamsRepository
        });
        await access.loadPermissions();
      });

      it('should return the readable streams', () => {
        const readableStreams = access.getReadableStreams();
        assert.isArray(readableStreams);
        let foundAB = false;
        let foundAAA = false;
        readableStreams.forEach(s => {
          if (s.id === 'ab') foundAB = true;
          if (s.id === 'aaa') foundAAA = true;
        });
        assert.isTrue(foundAB);
        assert.isTrue(foundAAA);
      });

    });

    
  });

  describe('events', function () {

    

  });
  
});

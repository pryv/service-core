/*global describe, it, before, after*/

const { assert } = require('chai');
const bluebird = require('bluebird');

const accessStorage = require('components/test-helpers').dependencies.storage.user.accesses;
const streamStorage = require('components/test-helpers').dependencies.storage
  .user.streams;
const userStorage = require('components/test-helpers').dependencies.storage.users;

const User = require('components/business/src/users').User;
const Access = require('components/business/src/accesses').Access;
const AccessesRepository = require('components/business/src/accesses').Repository;
const Stream = require('components/business/src/streams').Stream;
const StreamsRepository = require('components/business/src/streams').Repository;

require('components/api-server/test/test-helpers');
const { produceMongoConnection, context } = require('components/api-server/test/test-helpers');
const { databaseFixture } = require('components/test-helpers');

describe('Access', function () {

  let accessesRepository = new AccessesRepository(accessStorage, userStorage);
  let streamsRepository = new StreamsRepository(streamStorage, userStorage);

  let user, streams, access;

  after(async () => {
    await bluebird.fromCallback(cb => accessStorage.delete(user, {}, cb));
    await bluebird.fromCallback(cb => streamStorage.delete(user, {}, cb));
    await bluebird.fromCallback(cb => userStorage.remove({username: user.username}, cb));
  });

  describe('canReadStream()', function () {

    user = new User({
      username: 'bobbb',
    });

    streams = [
      new Stream({
        id: 'a',
        name: 'A'
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
      })
    ];

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

    before(async () => {

    });

    before(async () => {
      console.log('in da load');
      for(let i=0; i<streams.length; i++) {
        await streamsRepository.insertOne(user, streams[i]);
      }
      await access.loadPermissions();
      console.log('after da load');
    });

    describe('when the streams are readable', function () {

      it('should be able to read it', () => {
        assert.isTrue(access.canReadStream(streams[0]));
      });
      it('should be able to read its children', () => {
        assert.isTrue(access.canReadStream(streams[1]));
        assert.isTrue(access.canReadStream(streams[2]));
      });
      
    });

  });

  describe('canCreateStream()', function () {

  });

  describe('canUpdateStream()', function() {});

  describe('canDeleteStream()', function () { });

});
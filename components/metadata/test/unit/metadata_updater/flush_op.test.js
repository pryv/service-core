// @flow

// A test for the flush operation that flushes updates to disk. 

/* global describe, it, beforeEach, before, after */

const chai = require('chai');
const assert = chai.assert; 
const cuid = require('cuid');
const bluebird = require('bluebird');

const NullLogger = require('components/utils/src/logging').NullLogger;
const storage = require('components/storage');
const { databaseFixture } = require('components/test-helpers');

const { PendingUpdate } = 
  require('../../../src/metadata_updater/pending_updates');
const { Flush, UserRepository } = require('../../../src/metadata_updater/flush');

describe('Flush', () => {
  const connection = produceMongoConnection();
  const db = produceStorageLayer(connection);
  
  // Construct and clean a database fixture. 
  const pryv = databaseFixture(connection);
  after(function () {
    pryv.clean(); 
  });
  
  // Construct a simple database fixture containing an event to update
  let userId, parentStreamId, eventId; 
  before(async () => {
    userId = cuid(); 
    parentStreamId = cuid(); 
    eventId = cuid(); 
    
    await pryv.user(userId, {}, (user) => {
      user.stream({id: parentStreamId}, (stream) => {
        stream.event({
          id: eventId, 
          type: 'series:mass/kg'});
      });
    });
  });

  const now = new Date() / 1e3;
  
  // Constructs a flush op from a fake update
  let op: Flush; 
  beforeEach(() => {
    const update = makeUpdate(now, { 
      userId: userId, eventId: eventId, 
      author: 'author123', 
    }); 
    op = new Flush(update, db);
  });
  
  it('writes event metadata to disk', async () => {
    await op.run(); 
    
    const user = { id: userId };
    const query = { id: eventId };
    const event = await bluebird.fromCallback(
      cb => db.events.findOne(user, query, null, cb));

    assert.strictEqual(event.modifiedBy, 'author123');
    assert.approximately(event.modified, now, 1);
  });
});

describe('UserRepository', () => {
  const connection = produceMongoConnection();
  const db = produceStorageLayer(connection);

  // Construct and clean a database fixture. 
  const pryv = databaseFixture(connection);
  after(function () {
    pryv.clean(); 
  });

  // Construct a simple database fixture containing an event to update
  let userId;
  before(() => {
    userId = cuid(); 
    
    return pryv.user('user_name', { id: userId });
  });

  let repository: UserRepository;
  beforeEach(() => {
    repository = new UserRepository(db);
  });
  
  describe('#resolve(name)', () => {
    it('returns the user id', async () => {
      const user = await repository.resolve('user_name'); 
      assert.strictEqual(user.id, userId);
    });
    it('caches the user information for a while', async () => {
      // Prime the cache
      await repository.resolve('user_name'); 
      
      // Disable the database access for now; results can only come from the
      // cache. 
      // FLOW (These are not the robots you're looking for).
      repository.db = null; 
      
      const user = await repository.resolve('user_name'); 
      assert.strictEqual(user.id, userId);
    });
  });
});

function makeUpdate(now: number, attrs: UpdateAttrs={}): PendingUpdate {
  const myAttrs = {
    userId: attrs.userId || 'user', 
    eventId: attrs.eventId || 'event', 
    
    author: attrs.author || 'token1', 
    timestamp: attrs.timestamp || now, 
    dataExtent: {
      from: attrs.from || (now - 100), 
      to: attrs.to || now, 
    }
  };
  
  return PendingUpdate.fromUpdateRequest(now, myAttrs);
}
type UpdateAttrs = {
  from?: number, 
  to?: number, 
  timestamp?: number, 
  author?: string, 
  userId?: string, 
  eventId?: string, 
};

// Produces and returns a connection to MongoDB. 
// 
function produceMongoConnection(): storage.Database {
  const settings = {
    host: '127.0.0.1', 
    port: 27017,
    name: 'pryv-node',
  };
  const database = new storage.Database(
    settings, 
    new NullLogger()); 
  
  return database; 
}

// Produces a StorageLayer instance
// 
function produceStorageLayer(connection: storage.Database): storage.StorageLayer {
  const passwordResetRequestMaxAge = 60*1000;
  const sessionMaxAge = 60*1000;
    
  return new storage.StorageLayer(
    connection, 
    new NullLogger(), 
    'attachmetsDirPath', 'previewsDirPath', 
    passwordResetRequestMaxAge,
    sessionMaxAge);
}

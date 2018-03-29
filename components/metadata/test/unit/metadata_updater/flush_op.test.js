// @flow

// A test for the flush operation that flushes updates to disk. 

/* global describe, it, beforeEach, before, after */

const cuid = require('cuid');
const bluebird = require('bluebird');

const NullLogger = require('components/utils/src/logging').NullLogger;
const storage = require('components/storage');
const { databaseFixture } = require('components/test-helpers');

const { PendingUpdate } = 
  require('../../../src/metadata_updater/pending_updates');
const { Flush } = require('../../../src/metadata_updater/flush');

describe('Flush', () => {
  const connection = produceMongoConnection();
  const db = produceStorageLayer(connection);
  
  // Construct and clean a database fixture. 
  const pryv = databaseFixture(connection);
  // after(function () {
  //   pryv.clean(); 
  // });
  
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
  
  // Constructs a flush op from a fake update
  let op: Flush; 
  beforeEach(() => {
    const now = new Date() / 1e3;
    const update = makeUpdate(now, { userId: userId, eventId: eventId }); 
    op = new Flush(update, db);
  });
  
  it('writes event metadata to disk', async () => {
    op.run(); 
    
    const user = { id: userId };
    const query = { id: eventId };
    const event = await bluebird.fromCallback(
      cb => db.events.findOne(user, query, null, cb));
      
    console.log(event);
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

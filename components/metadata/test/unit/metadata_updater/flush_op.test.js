/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
// @flow

// A test for the flush operation that flushes updates to disk. 

/* global describe, it, beforeEach, before, after */

const chai = require('chai');
const assert = chai.assert; 
const cuid = require('cuid');
const bluebird = require('bluebird');
const charlatan = require('charlatan');


require('test-helpers/src/api-server-tests-config');
const storage = require('storage');
const { databaseFixture } = require('test-helpers');

const { PendingUpdate } = 
  require('../../../src/metadata_updater/pending_updates');
const { Flush, CustomUsersRepository } = require('../../../src/metadata_updater/flush');
const { getLogger } = require('@pryv/boiler');

describe('Flush', () => {
  const connection = produceMongoConnection();
  const db = produceStorageLayer(connection);
  const logger = getLogger('flush'); 

  const now = Date.now() / 1000;
  const initialDuration = 100;
  const fromDeltaTime = initialDuration - 10; 
  const toDeltaTime = initialDuration - 1;

  const modifiedTime = Date.now() / 1e3 ;
  
  // Construct and clean a database fixture. 
  const pryv = databaseFixture(connection);
  after(function () {
    pryv.clean(); 
  });
  
  // Construct a simple database fixture containing an event to update
  let userId, parentStreamId, eventId, eventWithContentId; 
  before(async () => {
    userId = cuid(); 
    parentStreamId = cuid(); 
    eventId = cuid(); 
    eventWithContentId = cuid(); 
    
    await pryv.user(userId, {}, (user) => {
      user.stream({id: parentStreamId}, (stream) => {
        stream.event({
          time: now,
          id: eventId, 
          type: 'series:mass/kg', 
          description: 'no initial data',
          content: {
            elementType: 'mass/kg', 
            fields: ['value'], 
            required: ['value'],
          }
        });
        stream.event({
          time: now,
          id: eventWithContentId, 
          type: 'series:mass/kg', 
          description: 'with initial ' + initialDuration + ' seconds off data ',
          content: {
            elementType: 'mass/kg', 
            fields: ['value'], 
            required: ['value']
          },
          duration: initialDuration,
        });
      });
    });
  });

  describe('event with no existing metadata', () => {
    // Constructs a flush op from a fake update
    let op: Flush; 
    beforeEach(() => {
      const update = makeUpdate(now, { 
        userId: userId, eventId: eventId, 
        author: 'author123', 
        from: fromDeltaTime, 
        to: toDeltaTime,
      }); 
      op = new Flush(update, db, logger);
    });
    
    it('[D5N1] writes event metadata to disk', async () => {
      await op.run();
      const event = await loadEvent(db, userId, eventId);
      assert.strictEqual(event.modifiedBy, 'author123');
      assert.approximately(event.modified, modifiedTime, 3);
      assert.strictEqual(event.duration, toDeltaTime); 
    });
  });
  describe('event with existing metadata', () => {
    // Constructs a flush op from a fake update
    let op: Flush; 
    beforeEach(() => {
      const update = makeUpdate(now, { 
        userId: userId, eventId: eventWithContentId, 
        author: 'author123', 
        from: fromDeltaTime, 
        to: toDeltaTime,
      }); 
      op = new Flush(update, db, logger);
    });
    
    it('[5QO0] doesn\'t modify duration', async () => {
      await op.run(); 
      const event = await loadEvent(db, userId, eventWithContentId);
      // See fixture above
      assert.strictEqual(event.duration, initialDuration ); 
    });

    it('[Z70F] leaves base data intact', async () => {
      await op.run(); 
      const event = await loadEvent(db, userId, eventWithContentId);

      const content = event.content;
      assert.strictEqual(content.elementType, 'mass/kg');
      assert.deepEqual(content.fields, ['value']);
      assert.deepEqual(content.required, ['value']);
    });

    it('[UD1B] update event duration if over current Duration', async () => {
      const update = makeUpdate(now, { 
        userId: userId, eventId: eventWithContentId, 
        author: 'author123', 
        from: fromDeltaTime, 
        to: toDeltaTime + 100,
      }); 
      const op2 = new Flush(update, db, logger);
      await op2.run(); 
      const event = await loadEvent(db, userId, eventWithContentId);
      // See fixture above
      assert.strictEqual(event.duration, toDeltaTime + 100 ); 
    });

  });
});

describe('UsersRepository', () => {
  const connection = produceMongoConnection();
  const db = produceStorageLayer(connection);

  // Construct and clean a database fixture. 
  const pryv = databaseFixture(connection);
  after(function () {
    pryv.clean(); 
  });

  // Construct a simple database fixture containing an event to update
  let userId;
  let username;
  before(() => {
    userId = cuid(); 
    username = charlatan.App.name(5);
    return pryv.user(username, { id: userId });
  });

  let repository: CustomUsersRepository;
  beforeEach(() => {
    repository = new CustomUsersRepository(db);
  });
  
  describe('#resolve(name)', () => {
    it('[80TC] returns the user id', async () => {
      const user = await repository.resolve(username); 
      assert.strictEqual(user.id, userId);
    });
    it('[8K9H] caches the user information for a while', async () => {
      // Prime the cache
      await repository.resolve(username); 
      
      // Disable the database access for now; results can only come from the
      // cache. 
      // FLOW (These are not the robots you're looking for).
      repository.db = null; 
      
      const user = await repository.resolve(username); 
      assert.strictEqual(user.id, userId);
    });
  });
});

function makeUpdate(now: number, attrs: UpdateAttrs={}): PendingUpdate {
  const myAttrs = {
    userId: attrs.userId || 'user', 
    eventId: attrs.eventId || 'event', 
    
    author: attrs.author || 'token1', 
    timestamp: attrs.timestamp || Date.now() / 1e3, 
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
  return storage.getDatabaseSync(); 
}

// Produces a StorageLayer instance
// 
function produceStorageLayer(connection: storage.Database): storage.StorageLayer {
  return storage.getStorageLayerSync();
}

function loadEvent(db: storage.StorageLayer, userId: string, eventId: string): Promise<any> {
  const user = { id: userId };
  const query = { id: eventId };
  return bluebird.fromCallback(
    cb => db.events.findOne(user, query, null, cb));
}
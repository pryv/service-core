const async = require('async');
const toString = require('components/utils').toString;
const storage = new (require('../user/Events'));
const addUserIdToIndexIfNeeded = require('../Database').prototype.addUserIdToIndexIfNeeded;
/**
 * v1.5.0:
 *
 * - Changes Events.streamdId => Events.streamIds = [Events.streamdId]
 * // helpers: 
 * - find events with streamId property 
 * db.events.find({ "streamId": { $exists: true, $ne: null } }); 
 */
module.exports = function (context, callback) {
  console.log('V1.4.0 => v1.5.0 Migration started ');

  let eventCollection = null;
  const collectionInfo = addUserIdToIndexIfNeeded(storage.getCollectionInfo({ id: 'bob' }));
  let eventsMigrated = 0;

  async.series([
    getCollection, 
    migrateEvents,
    dropIndex,
    createIndex,
    function (done) {
      context.logInfo('V1.4.0 => v1.5.0 Migrated ' + eventsMigrated + ' events.');
      done();
    }
  ], callback);

  function getCollection(done) {
    context.database.getCollection({ name: 'events' }, function (err, collection) {
      eventCollection = collection;
      eventCollection.indexes({}, function (err, res) {
        //console.log(res);
        done(err);
      });
      
    });
  };

  function dropIndex(done) {
    eventCollection.dropIndex('userId_1_streamIds_1', function (err, res) {
      // ignore error
      done();
    });
  }

  function createIndex(done) {

    context.logInfo('Creating new Index');
    eventCollection.createIndex({ userId: 1, streamIds: 1 }, {background: true}, done);
  }

  async function migrateEvents(done) {
    const cursor = await eventCollection.find({ streamId: { $exists: true, $ne: null } });
    var requests = [];
    while (await cursor.hasNext()) {
      let document = await cursor.next();
      eventsMigrated++;
      context.logInfo('. ' + eventsMigrated + ' events');
      requests.push({
        'updateOne': {
          'filter': { '_id': document._id },
          'update': {
            '$set': { 'streamIds': [document.streamId] },
            '$unset': { 'streamId': ""}
          }
        }
      });

      if (requests.length === 1000) {
        //Execute per 1000 operations and re-init
        await eventCollection.bulkWrite(requests);
        requests = [];
      }
    };

    if (requests.length > 0) {
      await eventCollection.bulkWrite(requests);
    }
  };

};

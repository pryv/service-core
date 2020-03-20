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
  console.log('CRASH');
  process.exit(0);

  let eventCollection = null;
  const collectionInfo = addUserIdToIndexIfNeeded(storage.getCollectionInfo({ id: 'bob' }));
  let eventsMigrated = 0;

  async.series([
    getCollection, 
    dropIndex, 
    createIndex,
    migrateEvents,
    function (done) {
      console.log('V1.4.0 => v1.5.0 Migrated ' + eventsMigrated + ' events.');
      done();
    }
  ], callback);

  function getCollection(done) {
    context.database.getCollection({ name: 'events' }, function (err, collection) {
      eventCollection = collection;
      done(err);
    });
  };

  function dropIndex(done) {
    eventCollection.dropIndexes(done);
  }

  function createIndex(done) {
    async.mapSeries(collectionInfo.indexes, function (item, itemCallback) {
      eventCollection.createIndex(item.index, item.options, itemCallback);
    }, done);
  }

  async function migrateEvents(done) {
    const cursor = await eventCollection.find({ streamId: { $exists: true, $ne: null } });
    var requests = [];
    while (await cursor.hasNext()) {
      let document = await cursor.next();
      eventsMigrated++;
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

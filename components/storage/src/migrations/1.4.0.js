const async = require('async');
const toString = require('components/utils').toString;

/**
 * v1.4.0: Merges user-related collections: events, streams, accesses, profiles, followedSlices
 * 
 * - all: 
 *  - Add a new index on userId
 *  - Add userId to all compound indexes in the first position
 *  - Collections {userId}.{collection} have all their documents extended with a `userId` field containing the userId.
 *  - {collection} is filled with the data of all users
 *  - when a {userId}.{collection} content is fully transfered it is deleted
 *  - In case of interruption, the following migration launch will start by deleting the partially transferred {userId}.{collection} data from {collection} before resuming the transfer.
 * 
 * - streams:
 *  - field `id` is now called `streamId`
 *  - the `_id` field is now handled by MongoDB
 * 
 * - profiles:
 *  - field `id` is now called `profileId`
 *  - the `_id` field is now handled by MongoDB
 * 
 */
module.exports = function (context, callback) {

  // -- compile information from storage objects, .. indexes and migrations
  const collectionsInfo = [];
  const addUserIdToIndexIfNeeded = require('../Database').prototype.addUserIdToIndexIfNeeded;
  ['Profile', 'Accesses', 'FollowedSlices', 'Streams', 'Events'].forEach(function (storageName) {
    const storage = new (require('../user/' + storageName))(null);
    const collectionInfo = addUserIdToIndexIfNeeded(storage.getCollectionInfo({id: 'bob'}));
    collectionInfo.convertIdToItemId = storage.converters.convertIdToItemId;
    collectionsInfo.push(collectionInfo);
  });

  // -- Create Collections and Indexes
  function createDBAddIndexes(done) {
    async.mapSeries(collectionsInfo, function (collectionInfo, stepDone) {
      context.database.getCollection(collectionInfo, function (err, collection) {
        if (err) return stepDone(err);
        console.log(collectionInfo.name + '>>> Creating Indexes');
        async.mapSeries(collectionInfo.indexes, function(item, itemCallback) {
          collection.createIndex(item.index, item.options, itemCallback);
          console.log(collectionInfo.name, item.index);
        },stepDone);
      });
    },done);
  }

  var collectionList = {};
  // -- List All collections
  function listCollections(done) {
    context.database.db.listCollections().toArray( function (err, collectionInfos) {
        collectionInfos.map(function (col) {
          collectionList[col.name] = col;
        });
        done(err);
    });
  }

  async.series([createDBAddIndexes,listCollections,migrateUsers],callback);


  function migrateUsers(done) {
    context.database.getCollection({name: 'users'}, function (err, usersCol) {
      if (err) {
        return done(err);
      }

      usersCol.find({}).toArray(function (err, users) {
        if (err) {
          return done(err);
        }

        async.forEachSeries(users, migrateUser, function (err) {
          if (err) {
            return done(err);
          }

          context.logInfo('Data version is now 1.4.0');
          done();
        });
      });
    });
  }



  function migrateUser(user, userDone) {
    context.logInfo('Migrating user ' + toString.user(user) + '...');
    async.mapSeries(collectionsInfo, function (collectionInfo, collectionDone) {
      const collectionName = collectionInfo.name;
      const sourceName = user._id + '.' + collectionName;

      if (! collectionList[sourceName]) return collectionDone();

      const changeIdTo = collectionInfo.convertIdToItemId;
     

      var source = null;
      var destination = null;
      var counts = 0;
      async.series([
        function getSource(next) {
          context.database.getCollection({name: sourceName}, function (err, res) {
            if (err) {
              context.logError(err, 'retrieving ' + user._id + '.' + collectionName + ' collection');
            }
            source = res;
            next(err);
          });
        },
        function getCount(next) {
          source.find({}).count(function (err, countSource) {
            if (err) {
              context.logError(err, 'retrieving ' + user._id + '.' + collectionName + ' collection source count');
            } else {
              counts = countSource;
            }
            return next(err);
          });
        },

        function getDestination(next) {
          if (counts == 0) { return next(); }
          context.database.getCollection({name: collectionName}, function (err, res) {
            if (err) {
              context.logError(err, 'retrieving ' + collectionName + 'collection');
            }
            destination = res;
            next(err);
          });
        },

        function cleanDest(next) {
          if (counts == 0) { return next(); }
          destination.deleteMany({'userId': user._id},function (err, res) {
            next(err);
          });
        },

        async function migrate() {
          if (counts == 0) { return ; }

          /** Nice aggregate version, but was timeing out on large sets
          var aggregate = [{'$addFields': {'userId': user._id}}];
          if (changeIdTo) {
            var temp = {};
            temp[changeIdTo] = '$_id';
            aggregate.push({'$addFields': temp})
            aggregate.push({'$addFields': {'_id': {$concat: [user._id + '.', '$_id']}}});
          }
          const cursor = source.aggregate(aggregate);
           **/

          const cursor = source.find();
          var batch = [];
          while (await cursor.hasNext()) {
            let doc = await cursor.next();
            doc.userId = user._id;
            if (collectionName === 'events' && doc.tags) {
              // this was added to run on an old set of pryv.me data which is not required in production, can be ignored
              doc.tags = doc.tags.slice(0, 20); // max 20 tags
            }
            if (changeIdTo) {
              doc[changeIdTo] = doc._id;
              delete doc._id;
              //doc._id = user._id + '.' + doc._id;
            }
            batch.push(doc);
            if (batch.length > 10000) {
              await destination.insertMany(batch);
              batch = [];
              console.log('.');
            }
          };
          await destination.insertMany(batch);
        },


        function check(next) {
          if (counts == 0) { return next(); }
          destination.find({'userId': user._id}).count(function (err2, countDestination) {
            if (err2) {
              context.logError(err2, 'retrieving ' + user._id + '.' + collectionName + ' collection dest count');
            }
            context.logInfo('CHECK ' + collectionName + ' SRC: [' + counts + '] DEST: [' + countDestination + ']');
            next(err2);
          });
        },

        function dropCollection(next) {
          source.drop(function (err2, result2) {
            // we don't care about errors here
            next();
          });

        }], collectionDone);
    }, userDone);
  }
};

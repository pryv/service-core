const async = require('async');
const toString = require('components/utils').toString;

/**
 * v1.5.0:
 *
 * - Changes Events.streamdId => Events.streamIds = [Events.streamdId]
 * // helpers: 
 * - find events with streamId property 
 * db.events.find({ "streamId": { $exists: true, $ne: null } }); 
 */
module.exports = function (context, callback) {
  
  migrateEvents(context, callback);

  function migrateEvents(context, callback) {
    context.logInfo('Migrating Events ...');
    async.series([
      function _updateEvents(stepDone) {
        context.database.getCollection({ name: 'Events' }, function (err, eventsCol) {
          if (err) {
            context.logError(err, 'retrieving Event collection');
            return stepDone(err);
          }

          const cursor = source.find({streamId});
          var batch = [];
          while (await cursor.hasNext()) {
            let doc = await cursor.next();
            doc.userId = user._id;
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
       

        });
      }
    ], function (err) {
      if (err) {
        context.logError(err, 'migrating user');
        return callback(err);
      }
      context.logInfo('Successfully migrated user ' + toString.user(user) + '.');
      callback();
    });
  }

  function ignoreNSError(callback, err) {
    if (! err || err.message.indexOf('ns not found') !== -1) {
      return callback();
    } else {
      return callback(err);
    }
  }
};

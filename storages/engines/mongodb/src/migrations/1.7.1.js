/**
 * @license
 * Copyright (C) Pryv https://pryv.com
 * This file is part of Pryv.io and released under BSD-Clause-3 License
 * Refer to LICENSE file
 */

const { getLogger } = require('@pryv/boiler');
/**
 * v1.7.1:
 * - change delete date from numbers to daate
 */
module.exports = async function (context, callback) {
  const logger = getLogger('migration-1.7.1');
  logger.info('V1.7.0 => v1.7.1 Migration started');

  const eventsCollection = await context.database.getCollection({ name: 'events' });
  const streamsCollection = await context.database.getCollection({ name: 'streams' });
  const accessesCollection = await context.database.getCollection({ name: 'accesses' });
  const webhooksCollection = await context.database.getCollection({ name: 'webhooks' });

  await migrateDeletedDates(accessesCollection);
  await migrateDeletedDates(eventsCollection);
  await migrateDeletedDates(streamsCollection);
  await migrateDeletedDates(webhooksCollection);

  logger.info('V1.7.0 => v1.7.1 Migration finished');
  callback();

  // ----------------- DELETED Dates to Number

  async function migrateDeletedDates (collection) {
    const cursor = collection.find({ deleted: { $type: 'date' } });
    let requests = [];
    let document;
    let eventsMigrated = 0;
    while (await cursor.hasNext()) {
      document = await cursor.next();
      eventsMigrated++;
      requests.push({
        updateOne: {
          filter: { _id: document._id },
          update: {
            $set: { deleted: document.deleted.getTime() / 1000 }
          }
        }
      });

      if (requests.length === 1000) {
        // Execute per 1000 operations and re-init
        await collection.bulkWrite(requests);
        console.log('Updated date for ' + eventsMigrated + ' ' + collection.namespace);
        requests = [];
      }
    }

    if (requests.length > 0) {
      await collection.bulkWrite(requests);
      console.log('Updated date for ' + eventsMigrated + ' ' + collection.namespace);
    }
    console.log('Finalizing date update for ' + collection.namespace);
  }
};

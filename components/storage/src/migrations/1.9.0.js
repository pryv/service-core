/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getLogger } = require('@pryv/boiler');
const { integrity } = require('business');
/**
 * v1.7.5:
 * - migrate system streamIds in access permissions
 */
module.exports = async function (context, callback) {
  const logger = getLogger('migration-1.8.1');
  logger.info('V1.8.0 => v1.8.1 Migration started');
  await SystemStreamsSerializer.init();
  const eventsCollection = await context.database.getCollection({
    name: 'events'
  });
  try {
    const query = { headId: { $exists: true, $ne: null }, integrity: { $exists: true, $ne: null } };
    const cursor = eventsCollection.find(query, {});

    const BUFFER_SIZE = 500;
    let requests = [];
    while (await cursor.hasNext()) {
      const event = await cursor.next();
      const originalId = event._id;
      event.id = event.headId;
      delete event.headId;
      delete event.userId;
      delete event._id;
      const eventNewIntegrity = integrity.events.compute(event).integrity;

      if (event.integrity === eventNewIntegrity) continue;

      const request = {
        updateOne: {
          filter: { _id: originalId },
          update: {
            $set: { integrity: eventNewIntegrity }
          }
        }
      };
      requests.push(request);
      if (requests.length > BUFFER_SIZE) { requests = await flushToDb(requests, eventsCollection); }
    }
    await flushToDb(requests, eventsCollection);
  } catch (e) {
    return callback(e);
  }
  logger.info('V1.8.0 => v1.8.1 Migration finished');
  callback();

  async function flushToDb (requests, eventsCollection) {
    if (requests.length === 0) { return; }
    const result = await eventsCollection.bulkWrite(requests);
    logger.info(`flushed ${result.nModified} modifications into database`);
    return [];
  }
};

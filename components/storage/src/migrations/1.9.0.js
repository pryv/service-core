/**
 * @license
 * Copyright (C) 2012–2023 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getLogger, getConfig } = require('@pryv/boiler');
const { integrity } = require('business');
const { move } = require('fs-extra');
const { readdirSync, statSync } = require('fs');
const path = require('path');

/**
 * v1.9.0:
 * - migrate system streamIds in access permissions
 */
module.exports = async function (context, callback) {
  const logger = getLogger('migration-1.9.0');
  logger.info('V1.9.0 => v1.9.0 Migration started');
  await SystemStreamsSerializer.init();
  try {
    await moveAttachments();
    await migrateHistory(context);
  } catch (e) {
    return callback(e);
  }

  logger.info('V1.8.0 => v1.9.0 Migration finished');
  callback();
};

async function moveAttachments () {
  const { userLocalDirectory, getStorageLayer } = require('storage');
  const logger = getLogger('migration-1.9.0:attachments');
  const config = await getConfig();
  await userLocalDirectory.init();
  const eventFiles = (await getStorageLayer()).eventFiles;
  const oldAttachmentsDirPath = config.get('eventFiles:attachmentsDirPath');
  // 1- go through all originals attachments user Directory

  const fileNames = readdirSync(oldAttachmentsDirPath);
  for (const userId of fileNames) {
    const oldAttachmentUserDirPath = path.join(oldAttachmentsDirPath, userId);
    if (!statSync(oldAttachmentUserDirPath).isDirectory()) { logger.warn('Skipping File' + oldAttachmentUserDirPath); continue; }
    const userLocalDir = await userLocalDirectory.ensureUserDirectory(userId);
    // 2- get new attachment folder
    const newAttachmentDirPath = path.join(userLocalDir, 'attachments');
    // 3- move attachment
    await move(oldAttachmentUserDirPath, newAttachmentDirPath);
  }
}

async function migrateHistory (context) {
  const logger = getLogger('migration-1.9.0:historical-events');
  const eventsCollection = await context.database.getCollection({
    name: 'events'
  });

  // integrity value of historical have changed.. re-compute them
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

  async function flushToDb (requests, eventsCollection) {
    if (requests.length === 0) { return; }
    const result = await eventsCollection.bulkWrite(requests);
    logger.info(`flushed ${result.nModified} modifications into database`);
    return [];
  }
}


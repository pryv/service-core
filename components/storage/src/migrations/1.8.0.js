/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

// @flow
const bluebird = require('bluebird');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');

const { getLogger } = require('@pryv/boiler');

const DOT: string = '.';
import type { Permission } from 'business/src/accesses';



/**
 * v1.7.5: 
 * - migrate system streamIds in access permissions
 */
module.exports = async function (context, callback) {

  const logger = getLogger('migration-1.8.0');
  logger.info('V1.7.5 => v1.8.0 Migration started');

  const eventsCollection = await bluebird.fromCallback(cb => context.database.getCollection({ name: 'events' }, cb));

  await migrateUserids();
  
  logger.info('V1.7.5 => v1.8.0 Migration finished');
  callback();

  async function migrateUserids() {
    const userIndex = require('business/src/users/UserLocalIndex');
    await userIndex.init();
    const query =  { streamIds: { $in: [SystemStreamsSerializer.options.STREAM_ID_USERNAME] } };
    const cursor = await eventsCollection.find(query, {projection: {userId: 1, content: 1}});
    while (await cursor.hasNext()) {
      const user = await cursor.next();
      await userIndex.addUser(user.content, user.userId);
    }
    $$('*******************************************************************************************');
  }

};

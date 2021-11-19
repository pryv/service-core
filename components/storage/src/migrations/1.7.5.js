/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
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

  const { isPrivateSystemStreamId } = SystemStreamsSerializer;

  const logger = getLogger('migration-1.7.5');
  logger.info('V1.7.1 => v1.7.5 Migration started');

  const accessesCollection = await bluebird.fromCallback(cb =>
    context.database.getCollection({ name: 'accesses' }, cb));
  await migrateAccessPermissions(accessesCollection);

  logger.info('V1.7.1 => v1.7.5 Migration finished');
  callback();

  async function migrateAccessPermissions(collection) {
    const cursor = await collection.find({'permissions.streamId': { $regex : /^\./ }});
    let requests = [];
    let document;
    let accessesMigrated = 0;
    while (await cursor.hasNext()) {
      const access = await cursor.next();

      if (access.type !== 'personal') {
        const oldPermissions = access.permissions;
        if (hasDotPermission(oldPermissions)) {
          const newPermissions = oldPermissions.map(translateToNewOrNothing);
          requests.push({
            'updateOne': {
              'filter': { '_id': access._id },
              'update': {
                '$set': { permissions: newPermissions },
              }
            }
          });
          accessesMigrated++;
          if (requests.length === 50) {
            //Execute per 1000 operations and re-init
            await collection.bulkWrite(requests);
            logger.info('Updated access permissions streamIds for ' + accessesMigrated + ' ' + collection.namespace);
            requests = [];
          }    
        }


        
      }
      
    }

    if (requests.length > 0) {
      await collection.bulkWrite(requests);
      logger.info('Updated access permissions streamIds for ' + accessesMigrated + ' ' + collection.namespace);
    }
    
    function hasDotPermission(permissions: Array<Permission>): boolean {
      for (const permission: Permission of permissions) {
        if (permission.streamId != null && permission.streamId.startsWith(DOT)) return true;
      }
      return false;
    }

    function translateToNewOrNothing(permission: Permission): Permission {
      const oldStreamId: string = permission.streamId;
      if (oldStreamId == null) return permission;
      if (! oldStreamId.startsWith(DOT)) return permission;

      const streamIdWithoutPrefix = oldStreamId.substring(1);
      // case :_system:
      let newStreamId;
      if (isPrivateSystemStreamId(streamIdWithoutPrefix)) {
        newStreamId = ':_system:' + streamIdWithoutPrefix;
      } else {
        newStreamId = ':system:' + streamIdWithoutPrefix;
      }
      permission.streamId = newStreamId;
      return permission;
    }
  }

};

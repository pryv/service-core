/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var errors = require('errors').factory,
  async = require('async'),
  commonFns = require('./helpers/commonFunctions'),
  errorHandling = require('errors').errorHandling,
  methodsSchema = require('../schema/streamsMethods'),
  streamSchema = require('../schema/stream'),
  slugify = require('slug'),
  string = require('./helpers/string'),
  utils = require('utils'),
  treeUtils = utils.treeUtils,
  _ = require('lodash');

const bluebird = require('bluebird');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const ErrorMessages = require('errors/src/ErrorMessages');
const ErrorIds = require('errors/src/ErrorIds');

const { getLogger, getConfig } = require('@pryv/boiler');
const logger = getLogger('methods:streams');
const { getMall, streamsUtils } = require('mall');
const { changePrefixIdForStreams, replaceWithNewPrefix } = require('./helpers/backwardCompatibility');
const { pubsub } = require('messages');
const { getStorageLayer } = require('storage');

/**
 * Event streams API methods implementation.
 *
 * @param api
 * @param userStreamsStorage
 * @param userEventFilesStorage
 * @param notifyTests
 * @param logging
 * @param auditSettings
 * @param updatesSettings
 */
module.exports = async function (api) {
  const config = await getConfig();
  const storageLayer = await getStorageLayer();
  const userStreamsStorage = storageLayer.streams;
  const userEventFilesStorage = storageLayer.eventFiles;
  const auditSettings = config.get('versioning');
  const updatesSettings = config.get('updates');
  const mall = await getMall();

  const isStreamIdPrefixBackwardCompatibilityActive: boolean = config.get('backwardCompatibility:systemStreams:prefix:isActive');

  // RETRIEVAL
  api.register('streams.get',
    commonFns.getParamsValidation(methodsSchema.get.params),
    checkAuthorization,
    applyDefaultsForRetrieval,
    findAccessibleStreams,
    includeDeletionsIfRequested
  );

  function applyDefaultsForRetrieval(context, params, result, next) {
    _.defaults(params, {
      parentId: null,
      includeDeletionsSince: null
    });
    next();
  }

  async function checkAuthorization(context, params, result, next) {
    if (params.parentId && params.id) {
      throw errors.invalidRequestStructure('Do not mix "parentId" and "id" parameter in request');
    }

    if (params.parentId) {
      if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
        params.parentId = replaceWithNewPrefix(params.parentId);
      }
    }

    let streamId = params.id || params.parentId || null;
    if (! streamId ) return next(); // "*" is authorized for everyone

    if (! await context.access.canListStream(streamId)) {
      return next(errors.forbidden('Insufficient permissions or non-existant stream [' + streamId + ']'));
    }
    return next();
  }

  async function findAccessibleStreams(context, params, result, next) {

    if (params.parentId) {
      if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
        params.parentId = replaceWithNewPrefix(params.parentId);
      }
    }

    let streamId = params.id || params.parentId || '*';

    let storeId = params.storeId; // might me null
    if (storeId == null) {
      [storeId, streamId] = streamsUtils.storeIdAndStreamIdForStreamId(streamId);
    }

    let streams = await mall.streams.get(context.user.id,
      {
        id: streamId,
        storeId: storeId,
        expandChildren: true,
        includeDeletionsSince: params.includeDeletionsSince,
        includeTrashed: params.includeTrashed || params.state === 'all',
        excludedIds: context.access.getCannotListStreamsStreamIds(storeId),
      });

    if (streamId !== '*') {
      const fullStreamId = streamsUtils.streamIdForStoreId(streamId, storeId);
      const inResult = treeUtils.findById(streams, fullStreamId);
      if (!inResult) {
        return next(errors.unknownReferencedResource('unknown Stream:', params.parentId ? 'parentId' : 'id', fullStreamId, null));
      }
    } else if (! await context.access.canListStream('*')) { // request is "*" and not personal access
      // cherry pick accessible streams from result
      /********************************
       * This is not optimal (fetches all streams) and not accurate
       * This method can "duplicate" streams, if read rights have been given to a parent and one of it's children
       * Either:
       *  - detect parent / child relationships
       *  - pass a list of streamIds to store.streams.get() to get a consolidated answer
       *********************************/
      const listables = context.access.getListableStreamIds();
      const filteredStreams = [];
      for (const listable of listables) {
        const listableFullStreamId = streamsUtils.streamIdForStoreId(listable.streamId, listable.storeId);
        const inResult = treeUtils.findById(streams, listableFullStreamId);
        if (inResult) {
          const copy = _.cloneDeep(inResult);
          filteredStreams.push(copy);
        } else {
          if (storeId === 'local' && listable.storeId !== 'local') {
            // fetch stream structures for listables not in local and add it to the result
            const listableStreamAndChilds = await mall.streams.get(context.user.id,
              {
                id: listable.streamId,
                storeId: listable.storeId,
                expandChildren: true,
                includeDeletionsSince: params.includeDeletionsSince,
                includeTrashed: params.includeTrashed || params.state === 'all',
                excludedIds: context.access.getCannotListStreamsStreamIds(listable.storeId),
              });
            filteredStreams.push(...listableStreamAndChilds);
          }
        }
      }
      streams = filteredStreams;
    }

    // remove non visible parentIds from
    for (const rootStream of streams) { 
      if ((rootStream.parentId != null) && (! await context.access.canListStream(rootStream.parentId))) {
        rootStream.parentId = null;
      }
    };

    // if request was made on parentId .. return only the children
    if (params.parentId && streams.length === 1) {
      streams = streams[0].children;
    }

    if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
      streams = changePrefixIdForStreams(streams);
    }

    result.streams = streams;
    next();
  }

  function includeDeletionsIfRequested(context, params, result, next) {
    if (params.includeDeletionsSince == null) { return next(); }

    var options = {
      sort: { deleted: -1 }
    };

    userStreamsStorage.findDeletions(context.user, params.includeDeletionsSince, options,
      function (err, deletions) {
        if (err) { return next(errors.unexpectedError(err)); }

        result.streamDeletions = deletions;
        next();
      });
  }

  // CREATION

  api.register('streams.create',
    forbidSystemStreamsActions,
    commonFns.getParamsValidation(methodsSchema.create.params),
    applyDefaultsForCreation,
    applyPrerequisitesForCreation,
    createStream);

  function applyDefaultsForCreation(context, params, result, next) {
    _.defaults(params, { parentId: null });
    next();
  }

  async function applyPrerequisitesForCreation(context, params, result, next) {
    if (! await context.access.canCreateChildOnStream(params.parentId)) {
      return process.nextTick(next.bind(null, errors.forbidden()));
    }

    // strip ignored properties
    if (params.hasOwnProperty('children')) {
      delete params.children;
    }

    if (params.id) {
      if (string.isReservedId(params.id) ||
        string.isReservedId(params.id = slugify(params.id))) {
        return process.nextTick(next.bind(null, errors.invalidItemId(
          'The specified id "' + params.id + '" is not allowed.')));
      }
    }

    context.initTrackingProperties(params);

    next();
  }

  function createStream(context, params, result, next) {
    userStreamsStorage.insertOne(context.user, params, function (err, newStream) {
      if (err != null) {
        // Duplicate errors
        if (err.isDuplicate) {
          if (err.isDuplicateIndex('streamId')) {
            return next(errors.itemAlreadyExists(
              'stream', { id: params.id }, err));
          }
          if (err.isDuplicateIndex('name')) {
            return next(errors.itemAlreadyExists(
              'sibling stream', { name: params.name }, err));
          }
        }
        // Unknown parent stream error
        else if (params.parentId != null) {
          return next(errors.unknownReferencedResource(
            'parent stream', 'parentId', params.parentId, err
          ));
        }
        // Any other error
        return next(errors.unexpectedError(err));
      }

      result.stream = newStream;
      pubsub.notifications.emit(context.user.username, pubsub.USERNAME_BASED_STREAMS_CHANGED);
      next();
    });
  }

  // UPDATE

  api.register('streams.update',
    forbidSystemStreamsActions,
    commonFns.getParamsValidation(methodsSchema.update.params),
    commonFns.catchForbiddenUpdate(streamSchema('update'), updatesSettings.ignoreProtectedFields, logger),
    applyPrerequisitesForUpdate,
    updateStream);

  /**
   * Forbid to create or modify system streams, or add children to them
   *
   * @param {*} context
   * @param {*} params
   * @param {*} result
   * @param {*} next
   */
  function forbidSystemStreamsActions (context, params, result, next) {
   
    if (params.id != null) {
      if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
        params.id = replaceWithNewPrefix(params.id);
      }
    
      if (SystemStreamsSerializer.isSystemStreamId(params.id)) {
        return next(errors.invalidOperation(
          ErrorMessages[ErrorIds.ForbiddenAccountStreamsModification])
        );
      }
    }
    if (params.parentId != null) {
      if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
        params.parentId = replaceWithNewPrefix(params.parentId);
      }

      if (SystemStreamsSerializer.isSystemStreamId(params.parentId)) {
        return next(errors.invalidOperation(
          ErrorMessages[ErrorIds.ForbiddenAccountStreamsModification])
        );
      }
    }

    next();
  }

  async function applyPrerequisitesForUpdate(context, params, result, next) {
    if (params?.update?.parentId === params.id) {
      return next(errors.invalidOperation('The provided "parentId" is the same as the stream\'s "id".', params.update));
    }

    // check stream
    var stream = await context.streamForStreamId(params.id);
    if (!stream) {
      return process.nextTick(next.bind(null,
        errors.unknownResource(
          'stream', params.id
        )
      ));
    }

    if (!await context.access.canUpdateStream(stream.id)) {
      return process.nextTick(next.bind(null, errors.forbidden()));
    }

    // check target parent if needed
    if (params.update.parentId && ! await context.access.canCreateChildOnStream(params.update.parentId)) {
      return process.nextTick(next.bind(null, errors.forbidden()));
    }

    context.updateTrackingProperties(params.update);

    next();
  }

  function updateStream(context, params, result, next) {
    userStreamsStorage.updateOne(context.user, { id: params.id }, params.update,
      function (err, updatedStream) {
        if (err != null) {
          // Duplicate error
          if (err.isDuplicate) {
            if (err.isDuplicateIndex('name')) {
              return next(errors.itemAlreadyExists(
                'sibling stream', { name: params.update.name }, err
              ));
            }
          }
          // Unknown parent stream error
          else if (params.update.parentId != null) {
            return next(errors.unknownReferencedResource(
              'parent stream', 'parentId', params.update.parentId, err
            ));
          }
          // Any other error
          return next(errors.unexpectedError(err));
        }

        result.stream = updatedStream;
        pubsub.notifications.emit(context.user.username, pubsub.USERNAME_BASED_STREAMS_CHANGED);
        next();
      });
  }

  // DELETION

  api.register('streams.delete',
    forbidSystemStreamsActions,
    commonFns.getParamsValidation(methodsSchema.del.params),
    verifyStreamExistenceAndPermissions,
    deleteStream);

  async function verifyStreamExistenceAndPermissions(context, params, result, next) {
    _.defaults(params, { mergeEventsWithParent: null });

    context.stream = await context.streamForStreamId(params.id);
    if (context.stream == null) {
      return process.nextTick(next.bind(null,
        errors.unknownResource('stream', params.id)));
      }
    if (! await context.access.canDeleteStream(context.stream.id)) {
      return process.nextTick(next.bind(null, errors.forbidden()));
    }

    next();
  }

  function deleteStream(context, params, result, next) {
    if (context.stream.trashed == null) {
      // move to trash
      flagAsTrashed(context, params, result, next);
    } else {
      // actually delete
      deleteWithData(context, params, result, next);
    }
  }

  function flagAsTrashed(context, params, result, next) {
    var updatedData = { trashed: true };
    context.updateTrackingProperties(updatedData);

    userStreamsStorage.updateOne(context.user, { id: params.id }, updatedData,
      function (err, updatedStream) {
        if (err) { return next(errors.unexpectedError(err)); }

        result.stream = updatedStream;
        pubsub.notifications.emit(context.user.username, pubsub.USERNAME_BASED_STREAMS_CHANGED);
        next();
      });
  }

  async function deleteWithData(context, params, result, next) {
    let hasLinkedEvents;
    const [storeId, cleanStreamId] = streamsUtils.storeIdAndStreamIdForStreamId(params.id);
   
    // Load stream and chlidren (context.stream does not have expanded children tree)
    const streamToDeleteSingleArray = await mall.streams.get(context.user.id, { id: cleanStreamId, includeTrashed: true, expandChildren: true, storeId });
    const streamToDelete = streamToDeleteSingleArray[0]; //no need to check existence: done before in verifyStreamExistenceAndPermissions
    const streamAndDescendantIds = treeUtils.collectPluckFromRootItem(streamToDelete, 'id');

    // keep stream and children to delete in next step 
    context.streamToDeleteAndDescendantIds = streamAndDescendantIds;

    const parentId = streamToDelete.parentId;
    const cleanDescendantIds = streamAndDescendantIds.map((s) => streamsUtils.storeIdAndStreamIdForStreamId(s)[1]);
    
    // check if root stream and linked events exist
    if (params.mergeEventsWithParent === true && parentId == null) {
      return next(errors.invalidOperation(
        'Deleting a root stream with mergeEventsWithParent=true is rejected ' +
        'since there is no parent stream to merge linked events in.',
        { streamId: params.id }));
    }
   
    const events = await mall.events.getWithParamsByStore(context.user.id, { [storeId]: { streams: [{any: cleanDescendantIds}], limit: 1 }});
    hasLinkedEvents = !!events.length;

    if (hasLinkedEvents) {
      // has linked events -----------------
      if (params.mergeEventsWithParent === null) {
        return next(errors.invalidParametersFormat(
          'There are events referring to the deleted items ' +
          'and the `mergeEventsWithParent` parameter is missing.'));
      }

      if (params.mergeEventsWithParent) { // -- Case 1 -- Merge events with parent
        if (auditSettings.forceKeepHistory) { // generateLogIfNecessary
          const eventsStream = await mall.events.getStreamedWithParamsByStore(context.user.id, { [storeId]: { streams: [{any: cleanDescendantIds}]}});
          for await (event of eventsStream) {
            const eventToVersion = _.extend(event, { headId: event.id });
            delete eventToVersion.id;
            await mall.events.create(context.user.id, eventToVersion);
          }
        }

        // add parent stream Id if needed and remove deleted stream ids 
        // the following add "parentId" if not present and remove "streamAndDescendantIds"
        const query = { streams: [{ any: streamAndDescendantIds}] };
        await mall.events.updateMany(context.user.id, query, { addStreams: [parentId], removeStreams: streamAndDescendantIds});
        

      } else { 
        // case  mergeEventsWithParent = false

        const eventsStream = await mall.events.getStreamedWithParamsByStore(context.user.id, { [storeId]: { streams: [{any: cleanDescendantIds}]}});
        for await (event of eventsStream) {

          if (auditSettings.deletionMode === 'keep-everything') {
            const res = await mall.events.updateDeleteByMode(context.user.id,  'keep-everything', {id: event.id, state: 'all'});

          // history is untouched
          } else if (auditSettings.deletionMode === 'keep-authors') { // update event history
            await mall.events.updateMinimizeEventHistory(context.user.id, event.id);
            const res = await mall.events.updateDeleteByMode(context.user.id,  'keep-authors', {id: event.id, state: 'all'});

          } else { // default: deletionMode='keep-nothing'
            const remaningStreamsIds = _.difference(event.streamIds, streamAndDescendantIds);
            if (remaningStreamsIds.length > 0) {
                // event is still attached to existing streamId(s)
                // update the event without the streamIds
                const fieldsToSet = {streamIds: remaningStreamsIds};
                await mall.events.updateWithOriginal(context.user.id, event, fieldsToSet);

            } else { // remove the event and any attached data
              // remove the event's history
              await mall.events.delete(context.user.id, { headId: event.id, state: 'all' });
              // remove event's attachments 
              if (event.attachments != null && event.attachments.length > 0) {
                await bluebird.fromCallback((cb) => userEventFilesStorage.removeAllForEvent(context.user, event.id,cb));
              }
              const res = await mall.events.updateDeleteByMode(context.user.id,  'keep-nothing', {id: event.id, state: 'all'});
            }
          }
        }
      }

      pubsub.notifications.emit(context.user.username, pubsub.USERNAME_BASED_EVENTS_CHANGED);
    }
    // finally delete stream
    
    await bluebird.fromCallback((cb) => userStreamsStorage.delete(context.user, { id: { $in: context.streamToDeleteAndDescendantIds } }, cb));
      
    result.streamDeletion = { id: params.id };
    pubsub.notifications.emit(context.user.username, pubsub.USERNAME_BASED_STREAMS_CHANGED);
    next();
  }


};

/**
 * Returns if an array has all elements contained in another.
 *
 * @param {Array} a Contains element to check if they exists in b
 * @param {Array} b
 */
function arrayAIsIncludedInB (a, b) {
  return a.every(i => b.includes(i));
}

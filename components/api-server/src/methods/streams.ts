/**
 * @license
 * Copyright (C) 2012–2022 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
const errors = require('errors').factory;
const commonFns = require('./helpers/commonFunctions');
const methodsSchema = require('../schema/streamsMethods');
const streamSchema = require('../schema/stream');
const slugify = require('utils').slugify;
const string = require('./helpers/string');
const utils = require('utils');
const treeUtils = utils.treeUtils;
const _ = require('lodash');

const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const ErrorMessages = require('errors/src/ErrorMessages');
const ErrorIds = require('errors/src/ErrorIds');
const APIError = require('errors/src/APIError');

const { getLogger, getConfig } = require('@pryv/boiler');
const logger = getLogger('methods:streams');
const { getMall, storeDataUtils } = require('mall');
const {
  changePrefixIdForStreams,
  replaceWithNewPrefix,
} = require('./helpers/backwardCompatibility');
const { pubsub } = require('messages');

/**
 * Event streams API methods implementation.
 *
 * @param api
 * @param notifyTests
 * @param logging
 * @param auditSettings
 * @param updatesSettings
 */
module.exports = async function (api) {
  const config = await getConfig();
  const auditSettings = config.get('versioning');
  const updatesSettings = config.get('updates');
  const mall = await getMall();

  const isStreamIdPrefixBackwardCompatibilityActive: boolean = config.get(
    'backwardCompatibility:systemStreams:prefix:isActive'
  );

  // RETRIEVAL
  api.register(
    'streams.get',
    commonFns.getParamsValidation(methodsSchema.get.params),
    checkAuthorization,
    applyDefaultsForRetrieval,
    findAccessibleStreams,
    includeDeletionsIfRequested
  );

  function applyDefaultsForRetrieval(context, params, result, next) {
    _.defaults(params, {
      parentId: null,
      includeDeletionsSince: null,
    });
    next();
  }

  async function checkAuthorization(context, params, result, next) {
    if (params.parentId && params.id) {
      throw errors.invalidRequestStructure(
        'Do not mix "parentId" and "id" parameter in request'
      );
    }

    if (params.parentId) {
      if (
        isStreamIdPrefixBackwardCompatibilityActive &&
        !context.disableBackwardCompatibility
      ) {
        params.parentId = replaceWithNewPrefix(params.parentId);
      }
    }

    let streamId = params.id || params.parentId || null;
    if (!streamId) return next(); // "*" is authorized for everyone

    if (!(await context.access.canListStream(streamId))) {
      return next(
        errors.forbidden(
          'Insufficient permissions or non-existant stream [' + streamId + ']'
        )
      );
    }
    return next();
  }

  async function findAccessibleStreams(context, params, result, next) {
    if (params.parentId) {
      if (
        isStreamIdPrefixBackwardCompatibilityActive &&
        !context.disableBackwardCompatibility
      ) {
        params.parentId = replaceWithNewPrefix(params.parentId);
      }
    }

    let streamId = params.id || params.parentId || '*';

    let storeId = params.storeId; // might me null
    if (storeId == null) {
      // TODO: clarify smelly code (replace full stream id with in-store id?)
      [storeId, streamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamId);
    }

    let streams = await mall.streams.get(context.user.id, {
      id: streamId,
      storeId: storeId,
      expandChildren: -1,
      includeTrashed: params.includeTrashed || params.state === 'all',
      excludedIds: context.access.getCannotListStreamsStreamIds(storeId),
    });

    if (streamId !== '*') {
      const fullStreamId = storeDataUtils.getFullItemId(storeId, streamId);
      const inResult = treeUtils.findById(streams, fullStreamId);
      if (!inResult) {
        return next(
          errors.unknownReferencedResource(
            'unknown Stream:',
            params.parentId ? 'parentId' : 'id',
            fullStreamId,
            null
          )
        );
      }
    } else if (!(await context.access.canListStream('*'))) {
      // request is "*" and not personal access
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
        const listableFullStreamId = storeDataUtils.getFullItemId(
          listable.storeId,
          listable.streamId
        );
        const inResult = treeUtils.findById(streams, listableFullStreamId);
        if (inResult) {
          const copy = _.cloneDeep(inResult);
          filteredStreams.push(copy);
        } else {
          if (storeId === 'local' && listable.storeId !== 'local') {
            // fetch stream structures for listables not in local and add it to the result
            const listableStreamAndChilds = await mall.streams.get(
              context.user.id,
              {
                id: listable.streamId,
                storeId: listable.storeId,
                expandChildren: -1,
                includeTrashed: params.includeTrashed || params.state === 'all',
                excludedIds: context.access.getCannotListStreamsStreamIds(
                  listable.storeId
                ),
              }
            );
            filteredStreams.push(...listableStreamAndChilds);
          }
        }
      }
      streams = filteredStreams;
    }

    // remove non visible parentIds from
    for (const rootStream of streams) {
      if (
        rootStream.parentId != null &&
        !(await context.access.canListStream(rootStream.parentId))
      ) {
        rootStream.parentId = null;
      }
    }

    // if request was made on parentId .. return only the children
    if (params.parentId && streams.length === 1) {
      streams = streams[0].children;
    }

    if (
      isStreamIdPrefixBackwardCompatibilityActive &&
      !context.disableBackwardCompatibility
    ) {
      streams = changePrefixIdForStreams(streams);
    }

    result.streams = streams;
    next();
  }

  async function includeDeletionsIfRequested(context, params, result, next) {
    if (params.includeDeletionsSince == null) {
      return next();
    }
    let streamId = params.id || params.parentId || '*';

    let storeId = params.storeId; // might me null
    if (storeId == null) {
      // TODO: clarify smelly code (replace full stream id with in-store id?)
      [storeId, streamId] = storeDataUtils.parseStoreIdAndStoreItemId(streamId);
    }

    try {
      const deletedStreams = await mall.streams.getDeletions(
        context.user.id,
        params.includeDeletionsSince,
        [storeId]
      );
      result.streamDeletions = deletedStreams;
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
    return next();
  }

  // CREATION

  api.register(
    'streams.create',
    forbidSystemStreamsActions,
    commonFns.getParamsValidation(methodsSchema.create.params),
    applyDefaultsForCreation,
    applyPrerequisitesForCreation,
    createStream
  );

  function applyDefaultsForCreation(context, params, result, next) {
    _.defaults(params, { parentId: null });
    next();
  }

  async function applyPrerequisitesForCreation(context, params, result, next) {
    if (!(await context.access.canCreateChildOnStream(params.parentId))) {
      return process.nextTick(next.bind(null, errors.forbidden()));
    }

    // check if parentId is valid
    if (params.parentId != null) {
      const parentResults = await mall.streams.get(context.user.id, {
        id: params.parentId,
        includeTrashed: true,
        expandChildren: 1,
      });
      if (parentResults.length === 0) {
        return next(
          errors.unknownReferencedResource(
            'unknown Stream:',
            'parentId',
            params.parentId,
            null
          )
        );
      }
      if (parentResults[0].trashed != null) {
        // trashed parent
        return next(
          errors.invalidOperation(
            'parent stream is trashed',
            'parentId',
            params.parentId
          )
        );
      }
    }

    // strip ignored properties
    if (Object.hasOwnProperty.call(params, 'children')) {
      delete params.children;
    }

    if (params.id) {
      if (
        string.isReservedId(params.id) ||
        string.isReservedId((params.id = slugify(params.id)))
      ) {
        return process.nextTick(
          next.bind(
            null,
            errors.invalidItemId(
              'The specified id "' + params.id + '" is not allowed.'
            )
          )
        );
      }
    }

    context.initTrackingProperties(params);

    next();
  }

  async function createStream(context, params, result, next) {
    try {
      const newStream = await mall.streams.create(context.user.id, params);
      result.stream = newStream;
      pubsub.notifications.emit(
        context.user.username,
        pubsub.USERNAME_BASED_STREAMS_CHANGED
      );
      next();
    } catch (err) {
      // Already an API error
      if (err instanceof APIError) {
        return next(err);
      }
      return next(errors.unexpectedError(err));
    }
  }

  // UPDATE

  api.register(
    'streams.update',
    forbidSystemStreamsActions,
    commonFns.getParamsValidation(methodsSchema.update.params),
    commonFns.catchForbiddenUpdate(
      streamSchema('update'),
      updatesSettings.ignoreProtectedFields,
      logger
    ),
    applyPrerequisitesForUpdate,
    updateStream
  );

  /**
   * Forbid to create or modify system streams, or add children to them
   *
   * @param {*} context
   * @param {*} params
   * @param {*} result
   * @param {*} next
   */
  function forbidSystemStreamsActions(context, params, result, next) {
    if (params.id != null) {
      if (
        isStreamIdPrefixBackwardCompatibilityActive &&
        !context.disableBackwardCompatibility
      ) {
        params.id = replaceWithNewPrefix(params.id);
      }

      if (SystemStreamsSerializer.isSystemStreamId(params.id)) {
        return next(
          errors.invalidOperation(
            ErrorMessages[ErrorIds.ForbiddenAccountStreamsModification]
          )
        );
      }
    }
    if (params.parentId != null) {
      if (
        isStreamIdPrefixBackwardCompatibilityActive &&
        !context.disableBackwardCompatibility
      ) {
        params.parentId = replaceWithNewPrefix(params.parentId);
      }

      if (SystemStreamsSerializer.isSystemStreamId(params.parentId)) {
        return next(
          errors.invalidOperation(
            ErrorMessages[ErrorIds.ForbiddenAccountStreamsModification]
          )
        );
      }
    }

    next();
  }

  async function applyPrerequisitesForUpdate(context, params, result, next) {
    if (params?.update?.parentId === params.id) {
      return next(
        errors.invalidOperation(
          'The provided "parentId" is the same as the stream\'s "id".',
          params.update
        )
      );
    }

    // check stream
    var stream = await context.streamForStreamId(params.id);
    if (!stream) {
      return process.nextTick(
        next.bind(null, errors.unknownResource('stream', params.id))
      );
    }

    if (!(await context.access.canUpdateStream(stream.id))) {
      return process.nextTick(next.bind(null, errors.forbidden()));
    }

    // check parent (even if null for root )
    if (
      !(await context.access.canCreateChildOnStream(params.update.parentId))
    ) {
      return process.nextTick(next.bind(null, errors.forbidden()));
    }

    // check target parent if needed
    if (params.update.parentId) {
      const targetParentArray = await mall.streams.get(context.user.id, {
        id: params.update.parentId,
        includeTrashed: true,
        expandChildren: 1,
      });

      if (targetParentArray.length == 0) {
        // no parent
        return next(
          errors.unknownReferencedResource(
            'parent stream',
            'parentId',
            params.update.parentId
          )
        );
      }
      const targetParent = targetParentArray[0];
      if (targetParent.trashed != null) {
        // trashed parent
        return next(
          errors.invalidOperation(
            'parent stream is trashed',
            'parentId',
            params.update.parentId
          )
        );
      }

      if (targetParent.children != null) {
        for (const child of targetParent.children) {
          if (child.name === params.update.name) {
            return next(
              errors.itemAlreadyExists('sibling stream', {
                name: params.update.name,
              })
            );
          }
        }
      }
    }

    context.updateTrackingProperties(params.update);

    next();
  }

  async function updateStream(context, params, result, next) {
    try {
      const updateData = _.cloneDeep(params.update);
      updateData.id = params.id;
      const updatedStream = await mall.streams.update(
        context.user.id,
        updateData
      );
      result.stream = updatedStream;
      pubsub.notifications.emit(
        context.user.username,
        pubsub.USERNAME_BASED_STREAMS_CHANGED
      );
      return next();
    } catch (err) {
      if (err instanceof APIError) {
        return next(err);
      }
      return next(errors.unexpectedError(err));
    }
  }

  // DELETION

  api.register(
    'streams.delete',
    forbidSystemStreamsActions,
    commonFns.getParamsValidation(methodsSchema.del.params),
    verifyStreamExistenceAndPermissions,
    deleteStream
  );

  async function verifyStreamExistenceAndPermissions(
    context,
    params,
    result,
    next
  ) {
    _.defaults(params, { mergeEventsWithParent: null });

    context.stream = await context.streamForStreamId(params.id);
    if (context.stream == null) {
      return process.nextTick(
        next.bind(null, errors.unknownResource('stream', params.id))
      );
    }
    if (!(await context.access.canDeleteStream(context.stream.id))) {
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

  async function flagAsTrashed(context, params, result, next) {
    var updatedData = { trashed: true };
    context.updateTrackingProperties(updatedData);
    updatedData.id = params.id;
    try {
      const updatedStream = await mall.streams.update(
        context.user.id,
        updatedData
      );
      result.stream = updatedStream;
      pubsub.notifications.emit(
        context.user.username,
        pubsub.USERNAME_BASED_STREAMS_CHANGED
      );
      return next();
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
  }

  async function deleteWithData(context, params, result, next) {
    let hasLinkedEvents;
    const [storeId, storeStreamId] = storeDataUtils.parseStoreIdAndStoreItemId(
      params.id
    );

    // Load stream and chlidren (context.stream does not have expanded children tree)
    const streamToDeleteSingleArray = await mall.streams.get(context.user.id, {
      id: storeStreamId,
      includeTrashed: true,
      expandChildren: -1,
      storeId,
    });
    const streamToDelete = streamToDeleteSingleArray[0]; //no need to check existence: done before in verifyStreamExistenceAndPermissions
    const streamAndDescendantIds = treeUtils.collectPluckFromRootItem(
      streamToDelete,
      'id'
    );

    // keep stream and children to delete in next step
    context.streamToDeleteAndDescendantIds = streamAndDescendantIds;

    const parentId = streamToDelete.parentId;
    const cleanDescendantIds = streamAndDescendantIds.map(
      (s) => storeDataUtils.parseStoreIdAndStoreItemId(s)[1]
    );

    // check if root stream and linked events exist
    if (params.mergeEventsWithParent === true && parentId == null) {
      return next(
        errors.invalidOperation(
          'Deleting a root stream with mergeEventsWithParent=true is rejected ' +
            'since there is no parent stream to merge linked events in.',
          { streamId: params.id }
        )
      );
    }

    const events = await mall.events.getWithParamsByStore(context.user.id, {
      [storeId]: { streams: [{ any: cleanDescendantIds }], limit: 1 },
    });
    hasLinkedEvents = !!events.length;

    if (hasLinkedEvents) {
      // has linked events -----------------
      if (params.mergeEventsWithParent === null) {
        return next(
          errors.invalidParametersFormat(
            'There are events referring to the deleted items ' +
              'and the `mergeEventsWithParent` parameter is missing.'
          )
        );
      }

      if (params.mergeEventsWithParent) {
        // -- Case 1 -- Merge events with parent
        if (auditSettings.forceKeepHistory) {
          // generateLogIfNecessary
          const eventsStream = await mall.events.getStreamedWithParamsByStore(
            context.user.id,
            { [storeId]: { streams: [{ any: cleanDescendantIds }] } }
          );
          for await (const event of eventsStream) {
            const eventToVersion = _.extend(event, { headId: event.id });
            delete eventToVersion.id;
            await mall.events.create(context.user.id, eventToVersion);
          }
        }

        // add parent stream Id if needed and remove deleted stream ids
        // the following add "parentId" if not present and remove "streamAndDescendantIds"
        const query = { streams: [{ any: streamAndDescendantIds }] };
        await mall.events.updateMany(context.user.id, query, {
          addStreams: [parentId],
          removeStreams: streamAndDescendantIds,
        });
      } else {
        // case  mergeEventsWithParent = false

        const eventsStream = await mall.events.getStreamedWithParamsByStore(
          context.user.id,
          { [storeId]: { streams: [{ any: cleanDescendantIds }] } }
        );
        for await (const event of eventsStream) {
          if (auditSettings.deletionMode === 'keep-everything') {
            await mall.events.updateDeleteByMode(
              context.user.id,
              'keep-everything',
              { id: event.id, state: 'all' }
            );
            // history is untouched
          } else if (auditSettings.deletionMode === 'keep-authors') {
            // update event history
            await mall.events.updateMinimizeEventHistory(
              context.user.id,
              event.id
            );
            await mall.events.updateDeleteByMode(
              context.user.id,
              'keep-authors',
              { id: event.id, state: 'all' }
            );
          } else {
            // default: deletionMode='keep-nothing'
            const remaningStreamsIds = _.difference(
              event.streamIds,
              streamAndDescendantIds
            );
            if (remaningStreamsIds.length > 0) {
              // event is still attached to existing streamId(s)
              // update the event without the streamIds
              event.streamIds = remaningStreamsIds;
              await mall.events.update(context.user.id, event);
            } else {
              // remove the event and any attached data
              // remove the event's history
              await mall.events.delete(context.user.id, {
                headId: event.id,
                state: 'all',
              });
              // remove the event itself (update)
              await mall.events.updateDeleteByMode(
                context.user.id,
                'keep-nothing',
                { id: event.id, state: 'all' }
              );
            }
          }
        }
      }

      pubsub.notifications.emit(
        context.user.username,
        pubsub.USERNAME_BASED_EVENTS_CHANGED
      );
    }
    // finally delete stream
    for (const streamIdToDelete of context.streamToDeleteAndDescendantIds) {
      try {
        await mall.streams.updateDelete(context.user.id, streamIdToDelete);
      } catch (err) {
        logger.error('Failed deleted some streams', err);
      }
    }

    result.streamDeletion = { id: params.id };
    pubsub.notifications.emit(
      context.user.username,
      pubsub.USERNAME_BASED_STREAMS_CHANGED
    );
    next();
  }
};

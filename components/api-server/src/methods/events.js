/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

const cuid = require('cuid');
const utils = require('utils');
const errors = require('errors').factory;
const async = require('async');
const bluebird = require('bluebird');
const commonFns = require('./helpers/commonFunctions');
const methodsSchema = require('../schema/eventsMethods');
const eventSchema = require('../schema/event');
const timestamp = require('unix-timestamp');
const treeUtils = utils.treeUtils;
const streamsQueryUtils = require('./helpers/streamsQueryUtils');
const _ = require('lodash');
const SetFileReadTokenStream = require('./streams/SetFileReadTokenStream');
const SetSingleStreamIdStream = require('./streams/SetSingleStreamIdStream');
const ChangeStreamIdPrefixStream = require('./streams/ChangeStreamIdPrefixStream');

const { getStores, StreamsUtils } = require('stores');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getServiceRegisterConn } = require('business/src/auth/service_register');
const Registration = require('business/src/auth/registration');
const { getUsersRepository } = require('business/src/users');
const ErrorIds = require('errors/src/ErrorIds');
const ErrorMessages = require('errors/src/ErrorMessages');
const assert = require('assert');
const MultiStream = require('multistream');

const eventsGetUtil = require('./helpers/eventsGetUtils');

const { getAPIVersion } = require('middleware/src/project_version');

const {TypeRepository, isSeriesType} = require('business').types;

const { getLogger, getConfig } = require('@pryv/boiler');
const { getStorageLayer } = require('storage');

const { pubsub } = require('messages');

const { ResultError } = require('influx');

const BOTH_STREAMID_STREAMIDS_ERROR = 'It is forbidden to provide both "streamId" and "streamIds", please opt for "streamIds" only.';

const { changeMultipleStreamIdsPrefix, changeStreamIdsPrefixInStreamQuery } = require('./helpers/backwardCompatibility');
const { integrity } = require('business');

import type { MethodContext } from 'business';
import type { ApiCallback } from 'api-server/src/API';

// for typing
const Event = require('business/src/events/Event');
const Attachment = require('business/src/events/Attachment');
const Stream = require('business/src/streams/Stream');
const SystemStream = require('business/src/system-streams/SystemStream');

// Type repository that will contain information about what is allowed/known
// for events. 
const typeRepo = new TypeRepository(); 

/**
 * Events API methods implementations.
 * @param api
 */
module.exports = async function (api) 
{
  const config = await getConfig();
  const storageLayer = await getStorageLayer();
  const userEventsStorage = storageLayer.events;
  const userEventFilesStorage = storageLayer.eventFiles;
  const authSettings = config.get('auth');
  const eventTypesUrl = config.get('service:eventTypes');
  const auditSettings = config.get('versioning');
  const updatesSettings = config.get('updates');
  const openSourceSettings = config.get('openSource')
  const usersRepository = await getUsersRepository(); 
  const stores = await getStores();
  
  // Initialise the project version as soon as we can. 
  const version = await getAPIVersion();
  
  // Update types and log error
  typeRepo.tryUpdate(eventTypesUrl, version)
    .catch((err) => getLogger('typeRepo').warn(err));
    
  const logger = getLogger('methods:events');

  const STREAM_ID_ACTIVE: string = SystemStreamsSerializer.options.STREAM_ID_ACTIVE;

  // initialize service-register connection
  let serviceRegisterConn = {};
  if (! config.get('dnsLess:isActive')) {
    serviceRegisterConn = getServiceRegisterConn();
  }

  const isStreamIdPrefixBackwardCompatibilityActive: boolean = config.get('backwardCompatibility:systemStreams:prefix:isActive');

  // RETRIEVAL
  api.register('events.get',
    eventsGetUtil.coerceStreamsParam,
    commonFns.getParamsValidation(methodsSchema.get.params),
    eventsGetUtil.transformArrayOfStringsToStreamsQuery,
    eventsGetUtil.validateStreamsQueriesAndSetStore,
    changeStreamIdsPrefixInStreamQuery.bind(null, isStreamIdPrefixBackwardCompatibilityActive), // using currying to pass "isStreamIdPrefixBackwardCompatibilityActive" argument
    eventsGetUtil.applyDefaultsForRetrieval,
    applyTagsDefaultsForRetrieval,
    streamQueryCheckPermissionsAndReplaceStars,
    streamQueryExpandStreams,
    findEventsFromStore,
    includeLocalStorageDeletionsIfRequested);

  function applyTagsDefaultsForRetrieval(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (! context.access.canGetEventsWithAnyTag()) {
      var accessibleTags = Object.keys(context.access.tagPermissionsMap);
      params.tags = params.tags 
        ? _.intersection(params.tags, accessibleTags) 
        : accessibleTags;
    }
    next();
  }

  // the two tasks are joined as '*' replaced have their permissions checked 
  async function streamQueryCheckPermissionsAndReplaceStars(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    context.tracing.startSpan('streamQueries');
    const unAuthorizedStreams = [];
    const unAccessibleStreams = [];

    async function streamExistsAndCanGetEventsOnStream(streamId, storeId) {
      

      // remove eventual '#' in streamQuery
      const cleanStreamId = streamId.startsWith('#') ? streamId.substr(1) : streamId;
      
      const stream = await context.streamForStreamId(cleanStreamId, storeId);
      if (! stream) {
        unAccessibleStreams.push(cleanStreamId); 
        return ;
      }
      if (! await context.access.canGetEventsOnStream(cleanStreamId, storeId)) {
        unAuthorizedStreams.push(cleanStreamId);
      }
    }

    for (let streamQuery of params.streams) {
      // ------------ "*" case 
      if (streamQuery.any && streamQuery.any.includes('*')) {
        if (await context.access.canGetEventsOnStream('*', streamQuery.storeId)) continue; // We can keep star
      
        // replace any by allowed streams for reading
        const canRead = [];
        const cannotRead = [];
        for (const streamPermission of context.access.getStoresPermissions(streamQuery.storeId)) {
          if (await context.access.canGetEventsOnStream(streamPermission.streamId, streamQuery.storeId)) {
            canRead.push(streamPermission.streamId);
          } else {
            cannotRead.push(streamPermission.streamId)
          }
        }
        streamQuery.any = canRead;
        if (cannotRead.length > 0) {
          if (! streamQuery.not) streamQuery.not = [];
          //streamQuery.not.push(...cannotRead);
        }
      } else { // ------------ All other cases
        for (const key of ['any', 'all', 'not']) {
          if (streamQuery[key]) {
            for (let streamId of streamQuery[key]) {
              await streamExistsAndCanGetEventsOnStream(streamId, streamQuery.storeId);
            };
          }
        };
      }
    }

    if (unAuthorizedStreams.length > 0) {
      context.tracing.finishSpan('streamQueries');
      return next(errors.forbidden('stream [' + unAuthorizedStreams[0] + '] has not sufficent permission to get events'));
    }
    if (unAccessibleStreams.length > 0) {
      context.tracing.finishSpan('streamQueries');
      return next(errors.unknownReferencedResource(
        'stream' + (unAccessibleStreams.length > 1 ? 's' : ''),
        'streams',
        unAccessibleStreams));
    }
    next();
  }


  async function streamQueryExpandStreams(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    async function expandStreamInContext(streamId, storeId) {
      // remove eventual '#' in streamQuery
      if (streamId.startsWith('#')) {
        if (streamId === '#*') { // fence against '#*' request that could lead to expose system streams content
          streamId = '*';
        } else {
          return [streamId.substr(1)]; // do not expand Stream
        }
      }

      const query =  {
        id: streamId, 
        storeId: storeId, 
        includeTrashed: params.includeTrashed || params.state === 'all', 
        expandChildren: true,
        excludedIds: context.access.getCannotGetEventsStreamIds(storeId)
      };

      // do not expand SystemStreams for non-personal tokens
      if (streamId === '*' && storeId === 'local' && ! context.access.isPersonal()) {
        query.hideSystemStreams = true;
      }

      const tree = await stores.streams.get(context.user.id, query);
      
      // collect streamIds 
      const resultWithPrefix = treeUtils.collectPluck(tree, 'id');
      // remove storePrefix 
      const result = resultWithPrefix.map((fullStreamId) => {
        return StreamsUtils.storeIdAndStreamIdForStreamId(fullStreamId)[1];
      });
      return result;
    }

    try {
      params.streams = await streamsQueryUtils.expandAndTransformStreamQueries(params.streams, expandStreamInContext);
    } catch (e) {
      console.log(e);
      context.tracing.finishSpan('streamQueries');
      return next(e);
    }

    // delete streamQueries with no inclusions 
    params.streams = params.streams.filter(streamQuery => streamQuery.any || streamQuery.and);
    context.tracing.finishSpan('streamQueries');
    next();
  }

  /**
   * - Create a copy of the params per query
   * - Add specific stream queries to each of them
   * - Eventually apply limitations per store
   */
  async function findEventsFromStore(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (params.streams === null || params.streams.length === 0)  {
      result.events = [];
      return next();
    }

    // in> params.fromTime = 2 params.streams = [{any: '*' storeId: 'local'}, {any: 'access-gasgsg', storeId: 'audit'}, {any: 'action-events.get', storeId: 'audit'}]
    const paramsByStoreId = {};
    for (let streamQuery of params.streams) {
      const storeId = streamQuery.storeId;
      if (storeId == null) {
        console.error('Missing storeId' + params.streams);
        throw(new Error("Missing storeId" + params.streams));
      }
      if (! paramsByStoreId[storeId]) {
        paramsByStoreId[storeId] = _.cloneDeep(params); // copy the parameters
        paramsByStoreId[storeId].streams = []; // empty the stream query
      }
      delete streamQuery.storeId; 
      paramsByStoreId[storeId].streams.push(streamQuery);
    }
    // out> paramsByStoreId = { local: {fromTime: 2, streams: [{any: '*}]}, audit: {fromTime: 2, streams: [{any: 'access-gagsg'}, {any: 'action-events.get}]}


    
  
    // ---- apply limitation if any 
    const limitations = context.access.getLimitationsForMethodId('events.get');
    if (limitations) {
      for (let storeId of Object.keys(paramsByStoreId)) {
        const paramsForStore = paramsByStoreId[storeId];
        if (limitations[storeId]) { // found limitation for this store
          const limitation = limitations[storeId];
          if (limitation.streams) {
            if (paramsForStore.streams) { // apply to all streamQueries

              for (let streamQuery of paramsForStore.streams) {
                if (limitation.streams.all) {
                  if (!streamQuery.all) streamQuery.all = [];
                  streamQuery.all.push(...limitation.streams.all);
                }
                if (limitation.streams.not) {
                  if (!streamQuery.not) streamQuery.not = [];
                  streamQuery.not.push(...limitation.streams.not);
                }
              }

            } else { // use limitation as streamQuery
              paramsForStore.streams = [{
                all: limitation.streams.all,
                not: limitation.streams.not
              }];
            }
          }
        }
      }
    }


    /**
     * Will be called by "stores" for each source of event that need to be streames to result
     * @param {Store} store
     * @param {ReadableStream} eventsStream of "Events"
     */
    function addnewEventStreamFromSource (store, eventsStream: ReadableStream) {
      let stream: ?ReadableStream;
      if (isStreamIdPrefixBackwardCompatibilityActive && !context.disableBackwardCompatibility) {
        stream = eventsStream.pipe(new ChangeStreamIdPrefixStream());
      } else {
        stream = eventsStream;
      }
      stream = stream.pipe(new SetSingleStreamIdStream());
      if (store.settings?.attachments?.setFileReadToken) {
        stream = stream.pipe(new SetFileReadTokenStream({ access: context.access, filesReadTokenSecret: authSettings.filesReadTokenSecret }));
      }
      result.addToConcatArrayStream('events', stream);
    }

    await stores.events.generateStreams(context.user.id, paramsByStoreId, addnewEventStreamFromSource);
    result.closeConcatArrayStream('events');

    return next();
  }

  function includeLocalStorageDeletionsIfRequested(context, params, result, next) {

    if (params.modifiedSince == null || !params.includeDeletions) {
      return next();
    }

    const options = {
      sort: {deleted: params.sortAscending ? 1 : -1},
      skip: params.skip,
      limit: params.limit
    };

    userEventsStorage.findDeletionsStreamed(context.user, params.modifiedSince, options,
      function (err, deletionsStream) {
        if (err) {
          return next(errors.unexpectedError(err));
        }

        result.addStream('eventDeletions', deletionsStream);
        next();
      });
  }

  api.register('events.getOne',
    commonFns.getParamsValidation(methodsSchema.getOne.params),
    findEvent,
    checkIfAuthorized,
    includeHistoryIfRequested
  );

  async function findEvent(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const query = { 
      streamIds: {
        // forbid account stream ids
        $nin: SystemStreamsSerializer.getAccountStreamsIdsForbiddenForReading()
      },
      id: params.id 
    };
    try {
      const event: Event = await bluebird.fromCallback(cb => userEventsStorage.findOne(context.user, query, null, cb));

      if (event == null) return next(errors.unknownResource('event', params.id));

      context.event = event;

      next();
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
  }

  async function checkIfAuthorized(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (! context.event) return next();
    const event: Event = context.event;
    delete context.event;

    let canReadEvent: boolean = false;
    for (const streamId of event.streamIds) { // ok if at least one
      if (await context.access.canGetEventsOnStreamAndWithTags(streamId, event.tags)) {
        canReadEvent = true;
        break;
      }
    }
    if (! canReadEvent) return next(errors.forbidden());

    event.attachments = setFileReadToken(context.access, event.attachments);

    if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
      event.streamIds = changeMultipleStreamIdsPrefix(event.streamIds);
    }

    // To remove when streamId not necessary
    event.streamId = event.streamIds[0];     
    result.event = event;
    return next();
}

  async function includeHistoryIfRequested(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (!params.includeHistory) {
      return next();
    }
    const options = { sort: {modified: 1} };

    try {
      const history = await bluebird.fromCallback(cb => userEventsStorage.findHistory(context.user, params.id, options, cb))

      // To remove when streamId not necessary
      history.forEach(e => {
        if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
          e.streamIds = changeMultipleStreamIdsPrefix(e.streamIds);
        }
        e.streamId = e.streamIds[0]
        return e;
      });
        
      result.history = history;
      next();

    } catch (err) {
      next(errors.unexpectedError(err));
    }
  }

  // -------------------------------------------------------------------- CREATE

  api.register('events.create',
    commonFns.getParamsValidation(methodsSchema.create.params),
    normalizeStreamIdAndStreamIds,
    applyPrerequisitesForCreation,
    validateEventContentAndCoerce,
    verifycanCreateEventsOnStreamAndWIthTags,
    doesEventBelongToAccountStream,
    validateAccountStreamsForCreation,
    appendAccountStreamsDataForCreation,
    verifyUnicity,
    handleSeries,
    createEvent,
    removeActiveFromSibling,
    createAttachments,
    addIntegrityToContext,
    notify);

  function applyPrerequisitesForCreation(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const event: Event = context.newEvent;
    // default time is now
    _.defaults(event, { time: timestamp.now() });
    if (event.tags == null) {
      event.tags = [];
    }
    
    event.tags = cleanupEventTags(event.tags);
    
    context.files = sanitizeRequestFiles(params.files);
    delete params.files;

    context.initTrackingProperties(event);
    
    context.newEvent = event;
    next();
  }

  /**
   * Check if previous event (or "new event" for events creation) belongs to the account
   * streams
   * 
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  function doesEventBelongToAccountStream(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const allAccountStreamsIds: Array<string> = SystemStreamsSerializer.getAccountStreamIds();

    const isUpdate: boolean = (context.oldEvent != null) && (context.newEvent != null);
    const isDelete: boolean = (context.oldEvent != null) && (context.newEvent == null);
    
    if (isUpdate) {
      context.oldAccountStreamIds = _.intersection(allAccountStreamsIds, context.oldEvent.streamIds) // rename to oldEvent/newEvent
      context.accountStreamIds = _.intersection(allAccountStreamsIds, context.newEvent.streamIds)
      context.doesEventBelongToAccountStream = context.oldAccountStreamIds.length > 0;
    } else if (isDelete) {
      context.oldAccountStreamIds = _.intersection(allAccountStreamsIds, context.oldEvent.streamIds)
      context.doesEventBelongToAccountStream = context.oldAccountStreamIds.length > 0;
    } else {
      context.accountStreamIds = _.intersection(allAccountStreamsIds, context.newEvent.streamIds)
      context.doesEventBelongToAccountStream = context.accountStreamIds.length > 0;
    }
    next();
  }

  /**
   * 
   */
  function validateAccountStreamsForCreation(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (! context.doesEventBelongToAccountStream) return next();

    throwIfUserTriesToAddMultipleAccountStreamIds(context.accountStreamIds); // assert context.accountStreamIds.length == 1 - probably OK for mixing custom and account
    context.accountStreamId = context.accountStreamIds[0];

    throwIfStreamIdIsNotEditable(context.accountStreamId);
    
    next();
  }

  async function verifycanCreateEventsOnStreamAndWIthTags(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    for (const streamId of context.newEvent.streamIds) { // refuse if any context is not accessible
      if (! await context.access.canCreateEventsOnStreamAndWIthTags(streamId, context.newEvent.tags)) {
        return next(errors.forbidden());
      }
    }
    next();
  }

  /**
   * Do additional actions if event belongs to account stream
   */
  async function appendAccountStreamsDataForCreation(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (!context.doesEventBelongToAccountStream) {
      return next();
    }

    const editableAccountStreamsMap: Map<string, SystemStream> = SystemStreamsSerializer.getEditableAccountMap();
    context.accountStreamIdWithoutPrefix = SystemStreamsSerializer.removePrefixFromStreamId(context.accountStreamId);
    context.systemStream = editableAccountStreamsMap[context.accountStreamId];

    // when new account event is created, all other should be marked as nonactive
    context.newEvent.streamIds.push(STREAM_ID_ACTIVE);
    context.removeActiveEvents = true;

    context.newEvent.streamIds = addUniqueStreamIdIfNeeded(context.newEvent.streamIds, context.systemStream.isUnique);
    next();
  }

  /**
   * Update data on register and verify unicity on register and core
   */
  async function verifyUnicity(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if(! context.doesEventBelongToAccountStream) {
      return next();
    }

    const isCreation: boolean = context.oldEvent == null;

    const systemStream: SystemStream = context.systemStream;
    const streamIdWithoutPrefix: string = context.accountStreamIdWithoutPrefix;

    try{
      if (systemStream.isIndexed) { // assume can be unique as per test #42A1
        await sendDataToServiceRegister(context, isCreation);
      }
      if (systemStream.isUnique) {
        await usersRepository.checkDuplicates({[streamIdWithoutPrefix]: context.newEvent.content});
      }
    } catch (err) {
      return next(err);
    }
    next();

    /**
     * Build request and send data to service-register about unique or indexed fields update
     * @param {MethodContext} context 
     * @param {boolean} isCreation
     */
    async function sendDataToServiceRegister(context: MethodContext, isCreation: boolean): void {
      if (config.get('dnsLess:isActive')) {
        return;
      }

      const editableAccountStreamsMap: Map<string, SystemStream> = SystemStreamsSerializer.getEditableAccountMap();
      const streamIdWithoutPrefix: string = context.accountStreamIdWithoutPrefix;

      // send information update to service regsiter
      await serviceRegisterConn.updateUserInServiceRegister(
        context.user.username,
        [{ update: { 
            key: streamIdWithoutPrefix,
            value: context.newEvent.content,
            isUnique: editableAccountStreamsMap[context.accountStreamId].isUnique,
          } 
        }],
        // for isActive, "context.removeActiveEvents" is not enough because, it would be set 
        // to false if old event was active and is still active (no change)
        context.newEvent.streamIds.includes(STREAM_ID_ACTIVE) || // WTF
        context.oldEvent.streamIds.includes(STREAM_ID_ACTIVE),
        isCreation,
      );
    }
  }

  function handleSeries(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (isSeriesType(context.newEvent.type)) {
      if (openSourceSettings.isActive) {
        return next(errors.unavailableMethod());
      }
      try {
        context.newEvent.content = createSeriesEventContent(context);
      }
      catch (err) { return next(err); }
        
      // As long as there is no data, event duration is considered to be 0.
      context.newEvent.duration = 0; 
    }
    next();
  }

  async function createEvent(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      const newEvent: Event = await bluebird.fromCallback(cb => userEventsStorage.insertOne(context.user, context.newEvent, cb));

      if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
        newEvent.streamIds = changeMultipleStreamIdsPrefix(newEvent.streamIds);
      }

      // To remove when streamId not necessary
      newEvent.streamId = newEvent.streamIds[0];
      result.event = newEvent;
      next();
    } catch (err) {
      if (err.isDuplicateIndex('id')) {
        return next(errors.itemAlreadyExists('event', {id: params.id}, err));
      }
      // Any other error
      return next(errors.unexpectedError(err));
    }
  }

  function addUniqueStreamIdIfNeeded(streamIds: Array<string>, isUnique: boolean): Array<string> {
    if (! isUnique) {
      return streamIds;
    }
    if (! streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_UNIQUE)) {
      streamIds.push(SystemStreamsSerializer.options.STREAM_ID_UNIQUE);
    }
    return streamIds;
  }

  /**
   * Creates the event's body according to its type and context. 
   */
  function createSeriesEventContent(context: MethodContext): {} {
    const seriesTypeName = context.newEvent.type; 
    const eventType = typeRepo.lookup(seriesTypeName); 
    
    // assert: Type is a series type, so this should be always true: 
    assert.ok(eventType.isSeries()); 

    return {
      elementType: eventType.elementTypeName(), 
      fields: eventType.fields(), 
      required: eventType.requiredFields(),
    };
  }

  async function createAttachments(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      const attachments = await attachFiles(context, { id: result.event.id }, context.files);

      if (!attachments) {
        return next();
      }

      result.event.attachments = attachments;
      userEventsStorage.updateOne(context.user, { id: result.event.id }, { attachments: attachments },
        function (err, updatedEvent) {
          if (err) {
            return next(errors.unexpectedError(err));
          }
          // To remove when streamId not necessary
          updatedEvent.streamId = updatedEvent.streamIds[0];   
          result.event = updatedEvent;
          result.event.attachments = setFileReadToken(context.access, result.event.attachments);
          next();
        });
    } catch (err) {
      next(err);
    }
  }

  function addIntegrityToContext(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if(result?.event?.integrity != null ) {
      context.auditIntegrityPayload = {
        key: integrity.events.key(result.event),
        integrity: result.event.integrity,
      };
      if (process.env.NODE_ENV === 'test') {
        // double check integrity when running tests only
        if (result.event.integrity != integrity.events.hash(result.event)) {
          return next(new Error('integrity mismatch at events.create' + JSON.stringify(result.event)));
        }
      }
    }
    next();
  }

  // -------------------------------------------------------------------- UPDATE

  api.register('events.update',
    commonFns.getParamsValidation(methodsSchema.update.params),
    commonFns.catchForbiddenUpdate(eventSchema('update'), updatesSettings.ignoreProtectedFields, logger),
    normalizeStreamIdAndStreamIds,
    applyPrerequisitesForUpdate,
    validateEventContentAndCoerce,
    doesEventBelongToAccountStream,
    validateAccountStreamsForUpdate,
    generateVersionIfNeeded,
    updateAttachments,
    appendAccountStreamsDataForUpdate,
    verifyUnicity,
    updateEvent,
    removeActiveFromSibling,
    addIntegrityToContext,
    notify);

  async function applyPrerequisitesForUpdate(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {

    const eventUpdate: Event = context.newEvent;
    
    try {
      eventUpdate.tags = cleanupEventTags(eventUpdate.tags);
    } catch (err) {
      return next(err);
    }

    context.updateTrackingProperties(eventUpdate);

    let event;
    try {
      event = await bluebird.fromCallback(cb => userEventsStorage.findOne(context.user, {id: params.id}, null, cb));
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
    if (! event) {
      return next(errors.unknownResource('event', params.id));
    }

    // 1. check that have contributeContext on at least 1 existing streamId
    let canUpdateEvent: boolean = false;
    for (let i = 0; i < event.streamIds.length ; i++) {
      if (await context.access.canUpdateEventsOnStreamAndWIthTags(event.streamIds[i], event.tags)) {
        canUpdateEvent = true;
        break;
      }
    }
    if (! canUpdateEvent) return next(errors.forbidden());
    
    if (hasStreamIdsModification(eventUpdate)) {

      // 2. check that streams we add have contribute access
      const streamIdsToAdd: Array<string> = _.difference(eventUpdate.streamIds, event.streamIds);
      for (const streamIdToAdd of streamIdsToAdd) {
        if (! await context.access.canUpdateEventsOnStreamAndWIthTags(streamIdToAdd, event.tags)) {
          return next(errors.forbidden());
        }
      }

      // 3. check that streams we remove have contribute access        
      // streamsToRemove = event.streamIds - eventUpdate.streamIds
      const streamIdsToRemove: Array<string> = _.difference(event.streamIds, eventUpdate.streamIds);

      for (const streamIdToRemove of streamIdsToRemove) {
        if (! await context.access.canUpdateEventsOnStreamAndWIthTags(streamIdsToRemove, event.tags)) {
          return next(errors.forbidden());
        }
      }
    }

    const updatedEventType: string = eventUpdate.type;
    if(updatedEventType != null) {
      const currentEventType: string = event.type;
      const isCurrentEventTypeSeries: boolean = isSeriesType(currentEventType);
      const isUpdatedEventTypeSeries: boolean = isSeriesType(updatedEventType);
      if (! typeRepo.isKnown(updatedEventType) && isUpdatedEventTypeSeries) {
        return next(errors.invalidEventType(updatedEventType)); // We forbid the 'series' prefix for these free types. 
      }

      if((isCurrentEventTypeSeries && ! isUpdatedEventTypeSeries) || 
        (! isCurrentEventTypeSeries && isUpdatedEventTypeSeries)) {
        return next(errors.invalidOperation('Normal events cannot be updated to HF-events and vice versa.'));
      }
    }

    context.oldEvent = _.cloneDeep(event);
    context.newEvent = _.extend(event, eventUpdate);
    next();

    function hasStreamIdsModification(event: Event): boolean {
      return event.streamIds != null;
    }
  }

  /**
   * Depends on context.oldEvent
   */
  function generateVersionIfNeeded(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (! auditSettings.forceKeepHistory) {
      return next();
    }

    context.oldEvent = _.extend(context.oldEvent, {headId: context.oldEvent.id});
    delete context.oldEvent.id;
    // otherwise the history value will squat
    context.oldEvent = removeUniqueStreamId(context.oldEvent);
    userEventsStorage.insertOne(context.user, context.oldEvent, function (err) {
      if (err) {
        return next(errors.unexpectedError(err));
      }
      next();
    });

    function removeUniqueStreamId(event: Event): Event {
      const index = event.streamIds.indexOf(SystemStreamsSerializer.addPrivatePrefixToStreamId('unique'));
      if (index > -1) {
        event.streamIds.splice(index, 1);
      }
      return event;
    }
  }

  async function updateAttachments(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const eventInfo: {} = {
      id: context.newEvent.id,
      attachments: context.newEvent.attachments || []
    };
    try{
      const attachments: Array<Attachment> = await attachFiles(context, eventInfo, sanitizeRequestFiles(params.files));
      if (attachments) {
        context.newEvent.attachments = attachments;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  }


  /**
   * Do additional actions if event belongs to account stream
   */
  async function appendAccountStreamsDataForUpdate(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (! context.doesEventBelongToAccountStream) {
      return next();
    }

    const editableAccountStreamsMap: Map<string, SystemStream> = SystemStreamsSerializer.getEditableAccountMap();
    context.accountStreamIdWithoutPrefix = SystemStreamsSerializer.removePrefixFromStreamId(context.accountStreamId);
    context.systemStream = editableAccountStreamsMap[context.accountStreamId];

    if (hasBecomeActive(context.oldEvent.streamIds, context.newEvent.streamIds)) {
      context.removeActiveEvents = true;
    } else {
      context.removeActiveEvents = false;
    }

    next();
  }

  async function updateEvent(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      const updatedEvent: Event = await bluebird.fromCallback(cb =>
        userEventsStorage.updateOne(context.user, { _id: context.newEvent.id }, context.newEvent, cb));

      // if update was not done and no errors were catched
      //, perhaps user is trying to edit account streams
      if (!updatedEvent) {
        return next(errors.invalidOperation(
          ErrorMessages[ErrorIds.ForbiddenAccountEventModification])); // WTF this was checked earlier
      }

      if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
        updatedEvent.streamIds = changeMultipleStreamIdsPrefix(updatedEvent.streamIds);
      }
      // To remove when streamId not necessary
      updatedEvent.streamId = updatedEvent.streamIds[0];
      result.event = updatedEvent;
      result.event.attachments = setFileReadToken(context.access, result.event.attachments);
    } catch (err) {
      return next(err);
    };
    next();
  }

  /**
  * For account streams - 'active' streamId defines the 'main' event
  * from of the stream. If there are many events (like many emails), 
  * only one should be main/active
  */
  async function removeActiveFromSibling(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (! context.removeActiveEvents) {
      return next();
    }
    await bluebird.fromCallback(cb =>
      userEventsStorage.updateOne(context.user,
        {
          id: { $ne: result.event.id },
          streamIds: {
            $all: [
              context.accountStreamId, 
              STREAM_ID_ACTIVE
            ]
          }
        },
        { $pull: { streamIds: STREAM_ID_ACTIVE } }, cb)
    );
    next();
  }

  function notify(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    pubsub.notifications.emit(context.user.username, pubsub.USERNAME_BASED_EVENTS_CHANGED);

    // notify is called by create, update and delete
    // depending on the case the event properties will be found in context or event
    if (isSeriesEvent(context.event || result.event) && !openSourceSettings.isActive) {
      const isDelete: boolean = result.eventDeletion ? true : false;
      // if event is a deletion 'id' is given by result.eventDeletion
      const updatedEventId: string = isDelete ? _.pick(result.eventDeletion, ['id']) : _.pick(result.event, ['id']);
      const subject: string = isDelete ? pubsub.SERIES_DELETE_EVENTID_USERNAME : pubsub.SERIES_UPDATE_EVENTID_USERNAME;
      const payload = { username: context.user.username, event: updatedEventId }
      pubsub.series.emit(subject, payload)
    }

    function isSeriesEvent(event: Event): boolean {
      return event.type.startsWith('series:');
    }
    next();
  }

  /**
   * Fixes req.files structure for when attachments were sent without a filename, in which case
   * Express lists files as an array in a `file` property (instead of directly as properties).
   *
   * @param {Object} files
   * @returns {Object}
   */
  function sanitizeRequestFiles(files: ?Array<{}>): {} {
    if (! files || ! files.file || ! Array.isArray(files.file)) {
      // assume files is an object, nothing to do
      return files;
    }
    const result = {};
    files.file.forEach(function (item, i) {
      if (! item.filename) {
        item.filename = item.name;
      }
      result[i] = item;
    });
    return result;
  }

  async function normalizeStreamIdAndStreamIds(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const event: Event = isEventsUpdateMethod() ? params.update : params;

    // forbid providing both streamId and streamIds
    if (event.streamId != null && event.streamIds != null) {
      return next(errors.invalidOperation(BOTH_STREAMID_STREAMIDS_ERROR,
        { streamId: event.streamId, event: params.streamIds }));
    }

    // convert streamId to streamIds #streamIds
    if (event.streamId != null) {
      event.streamIds = [event.streamId];
    }
    
    // remove double entries from streamIds
    if (event.streamIds != null && event.streamIds.length > 1) {
      event.streamIds = [...new Set(event.streamIds)];
    }
    delete event.streamId;
    // using context.newEvent now - not params
    context.newEvent = event;

    
    // used only in the events creation and update
    if (event.streamIds != null && event.streamIds.length > 0) {
      if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
        event.streamIds = changeMultipleStreamIdsPrefix(event.streamIds, false);
      }
      const streamIdsNotFoundList: Array<string> = [];
      const streamIdsTrashed: Array<string> = [];
      for (streamId of event.streamIds) {
        const stream = await context.streamForStreamId(streamId, 'local');
        if (! stream) {
          streamIdsNotFoundList.push(streamId);
        } else if (stream.trashed) {
          streamIdsTrashed.push(streamId);
        } 
      };

      if (streamIdsNotFoundList.length > 0 ) {
        return next(errors.unknownReferencedResource(
          'stream', 'streamIds', streamIdsNotFoundList
        ));
      }
      if (streamIdsTrashed.length > 0 ) {
        return next(errors.invalidOperation(
          'The referenced streams "' + streamIdsTrashed + '" are trashed.',
          {trashedReference: 'streamIds'}
        ));
      }
    }
    
    next();

    function isEventsUpdateMethod() { return params.update != null; }
  }

  /**
   * Validates the event's content against its type (if known).
   * Will try casting string content to number if appropriate.
   *
   * @param {Object} context.newEvent contains the event data
   * @param {Object} params
   * @param {Object} result
   * @param {Function} next
   */
  async function validateEventContentAndCoerce(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const type: string = context.newEvent.type;

    // Unknown types can just be created as normal events. 
    if (! typeRepo.isKnown(type)) {
      // We forbid the 'series' prefix for these free types. 
      if (isSeriesType(type)) return next(errors.invalidEventType(type));

      // No further checks, let the user do what he wants. 
      return next();
    }
        
    // assert: `type` is known
    
    const eventType: {} = typeRepo.lookup(type);
    if (eventType.isSeries()) {
      // Series cannot have content on update, not here at least.
      if (isCreateSeriesAndHasContent(params) || isUpdateSeriesAndHasContent(params)) {
        return next(errors.invalidParametersFormat('The event content\'s format is invalid.', 'Events of type High-frequency have a read-only content'));
      }
      return next();
    }
    
    // assert: `type` is not a series but is known

    const content: {} = context.newEvent.hasOwnProperty('content') 
      ? context.newEvent.content
      : null;

    const validator: {} = typeRepo.validator();
    try {
      context.newEvent.content = await validator.validate(eventType, content);
      next();
    } catch (err) {
      next(errors.invalidParametersFormat('The event content\'s format is invalid.', err));
    }

    function isCreateSeriesAndHasContent(params): boolean {
      return params.content != null;
    }

    function isUpdateSeriesAndHasContent(params): boolean {
      return params.update != null && params.update.content != null;
    }

  }

  function throwIfStreamIdIsNotEditable(accountStreamId: string): void {
    const editableAccountMap: Map<string, SystemStream> = SystemStreamsSerializer.getEditableAccountMap();
    if (editableAccountMap[accountStreamId] == null) {
      throw errors.invalidOperation(
        ErrorMessages[ErrorIds.ForbiddenAccountEventModification],
        { streamId: accountStreamId }
      );
    }
  }

  function throwIfUserTriesToAddMultipleAccountStreamIds(accountStreamIds: Array<string>): void {
    if (accountStreamIds.length > 1) {
      throw errors.invalidOperation(
        ErrorMessages[ErrorIds.ForbiddenMultipleAccountStreams],
        { streamIds: accountStreamIds}
      );
    }
  }

  /**
   * Check if event belongs to account stream,
   * if yes, validate and prepend context with the properties that will be
   * used later like:
   * a) doesEventBelongToAccountStream: boolean
   * b) oldEventStreamIds: array<string>
   * c) accountStreamId - string - account streamId
   * 
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   */
  function validateAccountStreamsForUpdate(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (! context.doesEventBelongToAccountStream) return next();

    throwIfUserTriesToAddMultipleAccountStreamIds(context.accountStreamIds); // assert context.accountStreamIds.length == 1
    context.accountStreamId = context.accountStreamIds[0];
    context.oldAccountStreamIds.forEach(streamId => {
      throwIfStreamIdIsNotEditable(streamId);
    }); 

    throwIfRemoveAccountStreamId(context.oldAccountStreamIds, context.accountStreamIds);
    throwIfChangeAccountStreamId(context.oldAccountStreamIds, context.accountStreamId);
    
    next();

    function throwIfRemoveAccountStreamId(accountStreamIds: Array<string>, currentStreamIds: Array<string>) {
      if (_.difference(accountStreamIds, currentStreamIds).length > 0) {
        throw errors.invalidOperation(ErrorMessages[ErrorIds.ForbiddenToChangeAccountStreamId]);
      }
    }
    function throwIfChangeAccountStreamId (oldAccountStreamIds: Array<string>, accountStreamId: string) {
      if (! oldAccountStreamIds.includes(accountStreamId)) {
        throw errors.invalidOperation(ErrorMessages[ErrorIds.ForbiddenToChangeAccountStreamId]);
      }
    }
  }

  function cleanupEventTags(tags: ?Array<string>): Array<string> {      
    if (tags == null) return [];

    const limit: number = 500;
    
    tags = tags.map(function (tag) {
      if(tag.length > limit) {
        throw errors.invalidParametersFormat(
          'The event contains a tag that exceeds the size limit of ' +
          limit + ' characters.', tag);
      } 
      return tag.trim();
    }).filter(function (tag) { return tag.length > 0; });
    return tags;
  }

  /**
   * Saves the uploaded files (if any) as attachments, returning the corresponding attachments info.
   *
   * @param {Object} context
   * @param {Object} eventInfo Expected properties: id, attachments
   * @param files Express-style uploaded files object (as in req.files)
   */
  async function attachFiles(context: MethodContext, eventInfo: {}, files: Array<{}>) {
    if (! files) return;

    const attachments: Array<{}> = eventInfo.attachments ? eventInfo.attachments.slice() : [];

    for (const file of files) {
      //saveFile
      const fileId: string = await bluebird.fromCallback(cb =>
        userEventFilesStorage.saveAttachedFile(file.path, context.user, eventInfo.id, cb));

      const attachmentData = {
        id: fileId,
        fileName: file.originalname,
        type: file.mimetype,
        size: file.size
      };
      if (file.integrity != null) attachmentData.integrity = file.integrity;

      attachments.push(attachmentData);
      
      const storagedUsed = await usersRepository.getStorageUsedByUserId(context.user.id);

      // approximately update account storage size
      storagedUsed.attachedFiles += file.size;
      
      await usersRepository.updateOne(
        context.user,
        { attachedFiles: storagedUsed.attachedFiles },
        'system',
      );
    }
    return attachments;
  }

  // DELETION

  api.register('events.delete',
    commonFns.getParamsValidation(methodsSchema.del.params),
    checkEventForDelete,
    doesEventBelongToAccountStream,
    validateAccountStreamsForDeletion,
    generateVersionIfNeeded,
    function (context, params, result, next) {
      if (!context.oldEvent.trashed) {
        // move to trash
        flagAsTrashed(context, params, result, next);
      } else {
        // actually delete
        deleteWithData(context, params, result, next);
      }
    }, notify);

  /**
   * If event belongs to the account stream 
   * send update to service-register if needed
   * 
   * @param object user {id: '', username: ''}
   * @param object event
   * @param string accountStreamId - accountStreamId
   */
  async function sendDeletionToServiceRegister (username, content, accountStreamId) {
    if (config.get('dnsLess:isActive')) {
      return;
    }

    const editableAccountStreamsMap: Map<string, SystemStream> = SystemStreamsSerializer.getEditableAccountMap();
    const streamIdWithoutPrefix: string = SystemStreamsSerializer.removePrefixFromStreamId(accountStreamId);

    if (editableAccountStreamsMap[accountStreamId].isUnique) { // TODO should be isIndexed??
      await serviceRegisterConn.updateUserInServiceRegister(
        username,
        [{ 
          delete: {
            key: streamIdWithoutPrefix,
            value: content,
          }
        }],
      );
    }
  }
  
  async function flagAsTrashed(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const updatedData: {} = {
      trashed: true
    };
    context.updateTrackingProperties(updatedData);
    try {
      if (context.doesEventBelongToAccountStream){
        await sendDeletionToServiceRegister(
          context.user.username,
          context.oldEvent.content,
          context.accountStreamId,
        );
      }
      const updatedEvent: Event = await bluebird.fromCallback(cb =>
        userEventsStorage.updateOne(context.user, { _id: params.id }, updatedData, cb));

      // if update was not done and no errors were catched
      //, perhaps user is trying to edit account streams ---- WTF
      if (updatedEvent == null) {
        return next(errors.invalidOperation(
          ErrorMessages[ErrorIds.ForbiddenAccountEventModification]));
      }

      if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
        updatedEvent.streamIds = changeMultipleStreamIdsPrefix(updatedEvent.streamIds);
      }
      // To remove when streamId not necessary
      updatedEvent.streamId = updatedEvent.streamIds[0];

      result.event = updatedEvent;
      result.event.attachments = setFileReadToken(context.access, result.event.attachments);

      next();
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
  }

  function deleteWithData(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    async.series([
      function deleteHistoryCompletely(stepDone) {
        if (auditSettings.deletionMode !== 'keep-nothing') {
          return stepDone();
        }
        userEventsStorage.removeMany(context.user, {headId: params.id}, function (err) {
          if (err) {
            return stepDone(errors.unexpectedError(err));
          }
          stepDone();
        });
      },
      function minimizeHistory(stepDone) {
        if (auditSettings.deletionMode !== 'keep-authors') {
          return stepDone();
        }
        userEventsStorage.minimizeEventsHistory(context.user, params.id, function (err) {
          if (err) {
            return stepDone(errors.unexpectedError(err));
          }
          stepDone();
        });
      },
      function deleteEvent(stepDone) {
        userEventsStorage.delete(context.user, {id: params.id}, auditSettings.deletionMode,
          function (err) {
            if (err) {
              return stepDone(errors.unexpectedError(err));
            }
            result.eventDeletion = {id: params.id};
            stepDone();
          });
      },
      userEventFilesStorage.removeAllForEvent.bind(userEventFilesStorage, context.user, params.id),
      async function () {
        const storagedUsed = await usersRepository.getStorageUsedByUserId(context.user.id);

        // If needed, approximately update account storage size
        if (! storagedUsed || !storagedUsed.attachedFiles) {
          return;
        }
        storagedUsed.attachedFiles -= getTotalAttachmentsSize(context.event.attachments);
        await usersRepository.updateOne(
          context.user,
          storagedUsed,
          'system',
        );
      }
    ], next);
  }

  function getTotalAttachmentsSize(attachments: ?Array<{}>): number {
    if (attachments == null) {
      return 0;
    }
    return _.reduce(attachments, function (evtTotal, att) {
      return evtTotal + att.size;
    }, 0);
  }

  api.register('events.deleteAttachment',
    commonFns.getParamsValidation(methodsSchema.deleteAttachment.params),
    checkEventForDelete,
    async function (context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
      try {
        const attIndex = getAttachmentIndex(context.event.attachments, params.fileId);
        if (attIndex === -1) {
          return next(errors.unknownResource(
            'attachment', params.fileId
          ));
        }
        const deletedAtt: Attachment = context.event.attachments[attIndex];
        context.event.attachments.splice(attIndex, 1);

        const updatedData: {} = { attachments: context.event.attachments };
        context.updateTrackingProperties(updatedData);

        const alreadyUpdatedEvent: Event = await bluebird.fromCallback(cb =>
          userEventsStorage.updateOne(context.user, { _id: params.id }, updatedData, cb));

        // if update was not done and no errors were catched
        //, perhaps user is trying to edit account streams
        if (!alreadyUpdatedEvent) {
          return next(errors.invalidOperation(
            ErrorMessages[ErrorIds.ForbiddenAccountEventModification]));
        }

        // To remove when streamId not necessary
        alreadyUpdatedEvent.streamId = alreadyUpdatedEvent.streamIds[0];

        result.event = alreadyUpdatedEvent;
        result.event.attachments = setFileReadToken(context.access, result.event.attachments);

        await bluebird.fromCallback(cb => userEventFilesStorage.removeAttachedFile(context.user, params.id, params.fileId, cb));

        const storagedUsed = await usersRepository.getStorageUsedByUserId(context.user.id);

        // approximately update account storage size
        storagedUsed.attachedFiles -= deletedAtt.size;
        await usersRepository.updateOne(
          context.user,
          storagedUsed,
          'system',
        );
        pubsub.notifications.emit(context.user.username, pubsub.USERNAME_BASED_EVENTS_CHANGED);
        next();
      } catch (err) {
        next(err);
      }
    });


  async function checkEventForDelete(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const eventId: string = params.id;
    
    let event: ?Event;
    try {
      event = await bluebird.fromCallback(cb => userEventsStorage.findOne(context.user, { id: eventId }, null, cb));
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
    if (event == null) {
      return next(errors.unknownResource(
        'event', eventId
      ));
    }
      
    let canDeleteEvent: boolean = false;

    for (const streamId of event.streamIds) {
      if (await context.access.canUpdateEventsOnStreamAndWIthTags(streamId, event.tags)) {
        canDeleteEvent = true;
        break;
      }
    }
    if (!canDeleteEvent) return next(errors.forbidden());
    // save event from the database as an oldEvent
    context.oldEvent = event;

    // create an event object that could be modified
    context.event = Object.assign({}, event);
    next();
  }

  /**
   * Check if event should not be allowed for deletion
   * a) is not editable
   * b) is active
   */
  function validateAccountStreamsForDeletion(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (!context.doesEventBelongToAccountStream) {
      return next(); 
    }

    context.oldAccountStreamIds.forEach(streamId => {
      throwIfStreamIdIsNotEditable(streamId);
    });
    if (context.oldEvent.streamIds.includes(STREAM_ID_ACTIVE)) return next(errors.invalidOperation(ErrorMessages[ErrorIds.ForbiddenAccountEventModification])); 
    context.accountStreamId = context.oldAccountStreamIds[0];

    next();
  }

  /**
   * Returns the key of the attachment with the given file name.
   */
  function getAttachmentIndex(attachments, fileId) {
    return _.findIndex(attachments, function (att) {
      return att.id === fileId;
    });
  }

  /**
   * Sets the file read token for each of the given event's attachments (if any) for the given
   * access.
   *
   * @param access
   * @param attachments
   */
  function setFileReadToken(access: Access, attachments: Array<Attachment>): Array<Attachment> {
    if (attachments == null) { return; }
    attachments.forEach(function (att) {
      att.readToken = utils.encryption
        .fileReadToken(att.id, 
          access.id, access.token,
          authSettings.filesReadTokenSecret);
    });
    return attachments;
  }

  function hasBecomeActive(oldStreamIds: Array<string>, newSreamIds: Array<string>): boolean {
    return ! oldStreamIds.includes(STREAM_ID_ACTIVE) && newSreamIds.includes(STREAM_ID_ACTIVE);
  }

};



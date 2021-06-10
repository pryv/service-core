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

const { getStore } = require('stores');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const { getServiceRegisterConn } = require('business/src/auth/service_register');
const Registration = require('business/src/auth/registration');
const UsersRepository = require('business/src/users/repository');
const ErrorIds = require('errors/src/ErrorIds');
const ErrorMessages = require('errors/src/ErrorMessages');
const assert = require('assert');
const MultiStream = require('multistream');

const eventsGetUtil = require('./helpers/eventsGetUtils');

const { ProjectVersion } = require('middleware/src/project_version');

const {TypeRepository, isSeriesType} = require('business').types;

const { getLogger, getConfig } = require('@pryv/boiler');

const NATS_CONNECTION_URI = require('messages').NATS_CONNECTION_URI;
const NATS_UPDATE_EVENT = require('messages').NATS_UPDATE_EVENT;
const NATS_DELETE_EVENT = require('messages').NATS_DELETE_EVENT;
const { ResultError } = require('influx');

const BOTH_STREAMID_STREAMIDS_ERROR = 'It is forbidden to provide both "streamId" and "streamIds", please opt for "streamIds" only.';

import type { MethodContext } from 'business';
import type { ApiCallback } from 'api-server/src/API';

// Type repository that will contain information about what is allowed/known
// for events. 
const typeRepo = new TypeRepository(); 

/**
 * Events API methods implementations.
 * @param auditSettings
 */
module.exports = async function (
  api, userEventsStorage, userEventFilesStorage,
  authSettings, eventTypesUrl, notifications, logging,
  auditSettings, updatesSettings, openSourceSettings
) {


  const usersRepository = new UsersRepository(userEventsStorage);
  const config = await getConfig();
  const stores = await getStore();
  
  // Initialise the project version as soon as we can. 
  const version = (new ProjectVersion()).version();
  
  // Update types and log error
  typeRepo.tryUpdate(eventTypesUrl, version)
    .catch((err) => getLogger('typeRepo').warn(err));
    
  const logger = getLogger('methods:events');

  const STREAM_ID_ACTIVE: string = SystemStreamsSerializer.options.STREAM_ID_ACTIVE;
  
  let natsPublisher;
  if (!openSourceSettings.isActive) {
    const { NatsPublisher } = require('messages');
    natsPublisher = new NatsPublisher(NATS_CONNECTION_URI);
  }

    // initialize service-register connection
    let serviceRegisterConn = {};
    if (! config.get('dnsLess:isActive')) {
      serviceRegisterConn = getServiceRegisterConn();
    }

  // RETRIEVAL

  api.register('events.get',
    eventsGetUtil.coerceStreamsParam,
    commonFns.getParamsValidation(methodsSchema.get.params),
    eventsGetUtil.transformArrayOfStringsToStreamsQuery,
    eventsGetUtil.validateStreamsQueriesAndSetStore,
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
        for (const streamPermission of context.access.getStorePermissions(streamQuery.storeId)) {
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
      return next(errors.forbidden('stream [' + unAuthorizedStreams[0] + '] has not sufficent permission to get events'));
    }
    if (unAccessibleStreams.length > 0) {
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

      const query =  {id: streamId, state: params.state};

      // do not expand SystemStreams for non-personal tokens
      if (streamId === '*' && storeId === 'local' && ! context.access.isPersonal()) {
        query.hideSystemStreams = true;
      }

      const store = (await getStore()).sourceForId(storeId);
      const tree = await store.streams.get(context.user.id, query);

      // collect streamIds and exclude not readable streams that might have been expanded 
      const result = [];
      await treeUtils.filterTreeOnPromise(tree, false, async function(stream) {
        const canRead = await context.access.canGetEventsOnStream(stream.id, storeId)
        if (! canRead) return false; // break here (no inspection of childrens)
        result.push(stream.id);
        return true;
      });

      return result;
    }

    try {
      params.streams = await streamsQueryUtils.expandAndTransformStreamQueries(params.streams, expandStreamInContext);
    } catch (e) {
      console.log(e);
      return next(e);
    }

    // delete streamQueries with no inclusions 
    params.streams = params.streams.filter(streamQuery => streamQuery.any || streamQuery.and);

    next();
  }

  /**
   * Aggregate streamQueries by store in params.streamsQueryMapByStore
   * For legacy code, 'local' storage streamQuery is kept in params.streams
   * @param {*} context 
   * @param {*} params 
   * @param {*} result 
   * @param {*} next 
   * @returns 
   */
  async function findEventsFromStore(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (params.streams === null || params.streams.length === 0)  {
      result.events = [];
      return next();
    }

    // --- The following code my be moved directly into store.get()
    const storeQueryMap = {};
    let count = 0;
    for (let streamQuery of params.streams) {
      const storeId = streamQuery.storeId;
      if (! storeId) {
        console.error('Missing storeId' + params.streams);
        throw(new Error("Missing storeId" + params.streams));
      }
      if (! storeQueryMap[storeId]) storeQueryMap[storeId] = [];
      delete streamQuery.storeId;
      storeQueryMap[storeId].push(streamQuery);
      count++;
    }

    delete params.streams;
    params.streamsQueryMapByStore = storeQueryMap;
  

    /**
     * Will be called by "stores" for each source of event that need to be streames to result
     * @param {Store} store
     * @param {ReadableStream} eventsStream of "Events"
     */
    function addnewEventStreamFromSource (store, eventsStream) {
      let stream = eventsStream.pipe(new SetSingleStreamIdStream());
      if (store.settings?.attachments?.setFileReadToken) {
        stream = stream.pipe(new SetFileReadTokenStream({ access: context.access, filesReadTokenSecret: authSettings.filesReadTokenSecret }));
      }
      result.addToConcatArrayStream('events', stream);
    }

    await stores.events.generateStreams(context.user.id, params, addnewEventStreamFromSource);
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
    userEventsStorage.findOne(context.user, query, null, function (err, event) {
      if (err) {
        return next(errors.unexpectedError(err));
      }

      if (! event) {
        return next(errors.unknownResource('event', params.id));
      }
      context.event = event; // keep for next stage

      next();
    });
  }

  async function checkIfAuthorized(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (! context.event) return next();
    event = context.event;
    delete context.event;

    let canReadEvent = false;
    for (let i = 0; i < event.streamIds.length; i++) { // ok if at least one
      if (await context.access.canGetEventsOnStreamAndWithTags(event.streamIds[i], event.tags)) {
        canReadEvent = true;
        break;
      }
    }
    if (! canReadEvent) return next(errors.forbidden());

    setFileReadToken(context.access, event);

    // To remove when streamId not necessary
    event.streamId = event.streamIds[0];     
    result.event = event;
    return next();
}

  function includeHistoryIfRequested(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (!params.includeHistory) {
      return next();
    }

    var options = {
      sort: {modified: 1}
    };

    userEventsStorage.findHistory(context.user, params.id, options,
      function (err, history) {
        if (err) {
          return next(errors.unexpectedError(err));
        }

        // To remove when streamId not necessary
        history.forEach(e => e.streamId = e.streamIds[0]);
        
        result.history = history;
        next();
      });
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
    createEvent,
    handleEventsWithActiveStreamId,
    createAttachments,
    notify);

  function applyPrerequisitesForCreation(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const event = context.content;
    // default time is now
    _.defaults(event, { time: timestamp.now() });
    if (event.tags == null) {
      event.tags = [];
    }
    
    event.tags = cleanupEventTags(event.tags);
    
    context.files = sanitizeRequestFiles(params.files);
    delete params.files;

    context.initTrackingProperties(event);
    
    context.content = event;
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

    const isUpdate: boolean = context.oldContent != null && context.content != null;
    const isDelete: boolean = context.oldContent != null && context.content == null;
    
    if (isUpdate) {
      context.oldAccountStreamIds = _.intersection(allAccountStreamsIds, context.oldContent.streamIds)
      context.accountStreamIds = _.intersection(allAccountStreamsIds, context.content.streamIds)
      context.doesEventBelongToAccountStream = context.oldAccountStreamIds.length > 0;
    } else if (isDelete) {
      context.oldAccountStreamIds = _.intersection(allAccountStreamsIds, context.oldContent.streamIds)
      context.doesEventBelongToAccountStream = context.oldAccountStreamIds.length > 0;
    } else {
      context.accountStreamIds = _.intersection(allAccountStreamsIds, context.content.streamIds)
      context.doesEventBelongToAccountStream = context.accountStreamIds.length > 0;
    }
    next();
  }

  /**
   * 
   */
  function validateAccountStreamsForCreation(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (! context.doesEventBelongToAccountStream) return next();

    throwIfUserTriesToAddMultipleAccountStreamIds(context.accountStreamIds); // assert context.accountStreamIds.length == 1
    context.accountStreamId = context.accountStreamIds[0];
    throwIfStreamIdIsNotEditable(context.accountStreamId);

    next();
  }

  async function verifycanCreateEventsOnStreamAndWIthTags(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    for (const streamId of context.content.streamIds) { // refuse if any context is not accessible
      if (! await context.access.canCreateEventsOnStreamAndWIthTags(streamId, context.content.tags)) {
        return next(errors.forbidden());
      }
    }
    next();
  }

  /**
   * Do additional actions if event belongs to the account stream and is
   * 1) unique
   * 2) indexed
   * 3) active
   * Additional actions like
   * a) adding property to enforce uniqueness
   * b) sending data update to service-register
   * c) saving streamId 'active' has to be handled in a different way than
   * for all other events
   *
   * @param string username 
   * @param object contextContent 
   * @param boolean creation - if true - active streamId will be added by default
   */
  async function appendAccountStreamsDataForCreation(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    // check if event belongs to account stream ids
    if (!context.doesEventBelongToAccountStream) {
      return next();
    }

    const editableAccountStreamsMap: Map<string, SystemStream> = SystemStreamsSerializer.getEditableAccountMap();
    const streamIdWithoutPrefix: string = SystemStreamsSerializer.removePrefixFromStreamId(context.accountStreamId);
    const systemStream: SystemStream = editableAccountStreamsMap[context.accountStreamId];

    try{
      // when new account event is created, all other should be marked as nonactive
      context.content.streamIds.push(STREAM_ID_ACTIVE);
      context.removeActiveEvents = true;
            
      if (systemStream.isIndexed) {
        await sendDataToServiceRegister(context, true, editableAccountStreamsMap);
      }
      if (systemStream.isUnique) {
        context.content = enforceEventUniquenessIfNeeded(context.content, systemStream);
        await usersRepository.checkDuplicates({
          [streamIdWithoutPrefix]: context.content.content,
        });
      }
    } catch (err) {
      if (err.isDuplicate) {
        return next(Registration.handleUniquenessErrors(
          err,
          ErrorMessages[ErrorIds.UnexpectedError],
          { [streamIdWithoutPrefix]: context.content.content }));
      }
      return next(err);
    }
    next();
  }

  async function createEvent(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (isSeriesType(context.content.type)) {
      if (openSourceSettings.isActive) {
        return next(errors.unavailableMethod());
      }
      try {
        context.content.content = createSeriesEventContent(context);
      }
      catch (err) { return next(err); }
        
      // As long as there is no data, event duration is considered to be 0.
      context.content.duration = 0; 
    }
    userEventsStorage.insertOne(
      context.user, context.content, function (err, newEvent) {
        if (err != null) {
          // Expecting a duplicate error
          if (err.isDuplicateIndex('id')) {
            return next(errors.itemAlreadyExists('event', {id: params.id}, err));
          }
          // Any other error
          return next(errors.unexpectedError(err));
        }

        // To remove when streamId not necessary
        newEvent.streamId = newEvent.streamIds[0];
        result.event = newEvent;
        next();
      });
  }

  /**
   * TODO: probably remove this as we enforce uniqueness in another way
   * 
   * If event should be unique, add unique streamId
   * 
   * @param {object} contextContent 
   * @param {SystemStream} accountSystemStream 
   */
  function enforceEventUniquenessIfNeeded(contextContent: object, accountSystemStream: SystemStream): object {
    if (! accountSystemStream.isUnique) {
      return contextContent;
    }
    if (!contextContent.streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_UNIQUE)) {
      contextContent.streamIds.push(SystemStreamsSerializer.options.STREAM_ID_UNIQUE);
    }
    return contextContent;
  }

  /**
   * Creates the event's body according to its type and context. 
   */
  function createSeriesEventContent(context: MethodContext): {} {
    const seriesTypeName = context.content.type; 
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
        function (err) {
          if (err) {
            return next(errors.unexpectedError(err));
          }

          setFileReadToken(context.access, result.event);
          next();
        });
    } catch (err) {
      next(err);
    }
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
    updateEvent,
    handleEventsWithActiveStreamId,
    notify);

  async function applyPrerequisitesForUpdate(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {

    const eventUpdate = context.content;
    
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
    let canUpdateEvent = false;
    for (let i = 0; i < event.streamIds.length ; i++) {
      if (await context.access.canUpdateEventsOnStreamAndWIthTags(event.streamIds[i], event.tags)) {
        canUpdateEvent = true;
        break;
      }
    }
    if (! canUpdateEvent) return next(errors.forbidden());
    
    if (hasStreamIdsModification(eventUpdate)) {

      // 2. check that streams we add have contribute access
      const streamIdsToAdd = _.difference(eventUpdate.streamIds, event.streamIds);
      for (let i=0; i<streamIdsToAdd.length; i++) {
        if (! await context.access.canUpdateEventsOnStreamAndWIthTags(streamIdsToAdd[i], event.tags)) {
          return next(errors.forbidden());
        }
      }

      // 3. check that streams we remove have contribute access        
      // streamsToRemove = event.streamIds - eventUpdate.streamIds
      const streamIdsToRemove = _.difference(event.streamIds, eventUpdate.streamIds);

      for (let i = 0; i < streamIdsToRemove.length ; i++) {
        if (! await context.access.canUpdateEventsOnStreamAndWIthTags(streamIdsToRemove[i], event.tags)) {
          return next(errors.forbidden());
        }
      }
    }

    const updatedEventType = eventUpdate.type;
    if(updatedEventType != null) {
      const currentEventType = event.type;
      const isCurrentEventTypeSeries = isSeriesType(currentEventType);
      const isUpdatedEventTypeSeries = isSeriesType(updatedEventType);
      if (! typeRepo.isKnown(updatedEventType) && isUpdatedEventTypeSeries) {
        return next(errors.invalidEventType(updatedEventType)); // We forbid the 'series' prefix for these free types. 
      }

      if((isCurrentEventTypeSeries && ! isUpdatedEventTypeSeries) || 
        (! isCurrentEventTypeSeries && isUpdatedEventTypeSeries)) {
        return next(errors.invalidOperation('Normal events cannot be updated to HF-events and vice versa.'));
      }
    }

    context.oldContent = _.cloneDeep(event);
    context.content = _.extend(event, eventUpdate);
    next();

    function hasStreamIdsModification(event) {
      return event.streamIds != null;
    }
  }

  /**
   * Depends on context.oldContent
   */
  function generateVersionIfNeeded(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (!auditSettings.forceKeepHistory) {
      return next();
    }

    context.oldContent = _.extend(context.oldContent, {headId: context.oldContent.id});
    delete context.oldContent.id;
    // otherwise the history value will squat
    context.oldContent = removeUniqueStreamId(context.oldContent);
    userEventsStorage.insertOne(context.user, context.oldContent, function (err) {
      if (err) {
        return next(errors.unexpectedError(err));
      }
      next();
    });

    function removeUniqueStreamId(event) {
      const index = event.streamIds.indexOf('.unique');
      if (index > -1) {
        event.streamIds.splice(index, 1);
      }
      return event;
    }
  }

  async function updateAttachments(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    var eventInfo = {
      id: context.content.id,
      attachments: context.content.attachments || []
    };
    try{
      const attachments = await attachFiles(context, eventInfo, sanitizeRequestFiles(params.files));
      if (attachments) {
        context.content.attachments = attachments;
      }
      return next();
    } catch (err) {
      return next(err);
    }
  }


  /**
   * Do additional actions if event belongs to the account stream and is
   * 1) unique
   * 2) indexed
   * 3) active
   * Additional actions like
   * a) adding property to enforce uniqueness
   * b) sending data update to service-register
   * c) saving streamId 'active' has to be handled in a different way than
   * for all other events
   *
   * @param string username 
   * @param object contextContent 
   * @param boolean creation - if true - active streamId will be added by default
   */
  async function appendAccountStreamsDataForUpdate(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    // check if event belongs to account stream ids
    if (!context.doesEventBelongToAccountStream) {
      return next();
    }

    const editableAccountStreamsMap: Map<string, SystemStream> = SystemStreamsSerializer.getEditableAccountMap();
    const streamIdWithoutPrefix: string = SystemStreamsSerializer.removePrefixFromStreamId(context.accountStreamId);
    const systemStream: SystemStream = editableAccountStreamsMap[context.accountStreamId];

    try{
      context.removeActiveEvents = false;

      // if .active stream id was added to the event
      if (
        !context.oldContent.streamIds.includes(STREAM_ID_ACTIVE)
        && context.content.streamIds.includes(STREAM_ID_ACTIVE)
      ) {
        // after event will be saved, active property will be removed from the other events
        context.removeActiveEvents = true;
      }

      if (systemStream.isIndexed) {
        await sendDataToServiceRegister(context, false, editableAccountStreamsMap);
      }
      if (systemStream.isUnique) {
        context.content = enforceEventUniquenessIfNeeded(context.content, systemStream);
        await usersRepository.checkDuplicates({
          [streamIdWithoutPrefix]: context.content.content,
        });
      }
    } catch (err) {
      if (err.isDuplicate) {
        return next(Registration.handleUniquenessErrors(
          err,
          ErrorMessages[ErrorIds.UnexpectedError],
          { [streamIdWithoutPrefix]: context.content.content }));
      }
      return next(err);
    }
    next();
  }

  async function updateEvent(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      let updatedEvent = await bluebird.fromCallback(cb =>
        userEventsStorage.updateOne(context.user, { _id: context.content.id }, context.content, cb));

      // if update was not done and no errors were catched
      //, perhaps user is trying to edit account streams
      if (!updatedEvent) {
        return next(errors.invalidOperation(
          ErrorMessages[ErrorIds.ForbiddenAccountEventModification])); // WTF this was checked earlier
      }

      // To remove when streamId not necessary
      updatedEvent.streamId = updatedEvent.streamIds[0];
      result.event = updatedEvent;
      setFileReadToken(context.access, result.event);

    } catch (err) {
      return next(Registration.handleUniquenessErrors( // should be unexpected only
        err,
        ErrorMessages[ErrorIds.UnexpectedError],
        { [SystemStreamsSerializer.removePrefixFromStreamId(context.accountStreamId)]: context.content.content }));
    };
    next();
  }

  /**
  * For account streams - 'active' streamId defines the 'main' event
  * from of the stream. If there are many events (like many emails), 
  * only one should be main/active
  */
  async function handleEventsWithActiveStreamId(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    // if it is needed update events from the same account stream
    if (!context.removeActiveEvents) {
      return next();
    }
    await bluebird.fromCallback(cb =>
      userEventsStorage.updateMany(context.user, // why many? there should be a single one
        {
          id: { $ne: result.event.id },
          streamIds: {
            $all: [
              // if we use active stream id not only for account streams
              // this should be made more general
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
    notifications.eventsChanged(context.user);

    // notify is called by create, update and delete
    // depending on the case the event properties will be found in context or event
    if (isSeriesEvent(context.event || result.event) && !openSourceSettings.isActive) {
      const isDelete = result.eventDeletion ? true : false;
      // if event is a deletion 'id' is given by result.eventDeletion
      const updatedEventId = isDelete ? _.pick(result.eventDeletion, ['id']) : _.pick(result.event, ['id']);
      const subject = isDelete ? NATS_DELETE_EVENT : NATS_UPDATE_EVENT;
      natsPublisher.deliver(subject, {
        username: context.user.username,
        event: updatedEventId,
      });
    }

    function isSeriesEvent(event) {
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
  function sanitizeRequestFiles(files) {
    if (! files || ! files.file || ! Array.isArray(files.file)) {
      // assume files is an object, nothing to do
      return files;
    }
    var result = {};
    files.file.forEach(function (item, i) {
      if (! item.filename) {
        item.filename = item.name;
      }
      result[i] = item;
    });
    return result;
  }

  async function normalizeStreamIdAndStreamIds(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const event = isEventsUpdateMethod() ? params.update : params;

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
    // using context.content now - not params
    context.content = event;

    
    // used only in the events creation and update
    if (event.streamIds != null && event.streamIds.length > 0) {
      const streamIdsNotFoundList = [];
      const streamIdsTrashed = [];
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
   * @param {Object} context.content contains the event data
   * @param {Object} params
   * @param {Object} result
   * @param {Function} next
   */
  function validateEventContentAndCoerce(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const type = context.content.type;

    // Unknown types can just be created as normal events. 
    if (! typeRepo.isKnown(type)) {
      // We forbid the 'series' prefix for these free types. 
      if (isSeriesType(type)) return next(errors.invalidEventType(type));

      // No further checks, let the user do what he wants. 
      return next();
    }
        
    // assert: `type` is known
    
    const eventType = typeRepo.lookup(type);
    if (eventType.isSeries()) {
      // Series cannot have content on update, not here at least.
      if (isCreateSeriesAndHasContent() || isUpdateSeriesAndHasContent()) {
        return next(errors.invalidParametersFormat('The event content\'s format is invalid.', 'Events of type High-frequency have a read-only content'));
      }
      return next();
    }
    
    // assert: `type` is not a series but is known

    const content = context.content.hasOwnProperty('content') 
      ? context.content.content
      : null;

    const validator = typeRepo.validator();
    validator.validate(eventType, content)
      .then(function (newContent) {
        // Store the coerced value. 
        context.content.content = newContent; 
        next();
        return null;
      })
      .catch(
        (err) => next(errors.invalidParametersFormat(
          'The event content\'s format is invalid.', err))
      );

    function isCreateSeriesAndHasContent() {
      return params.content != null;
    }

    function isUpdateSeriesAndHasContent() {
      return params.update != null && params.update.content != null;
    }

  }

  /**
   * Forbid event editing if event has non editable core stream
   * @param {string} streamId
   */
  function throwIfStreamIdIsNotEditable(streamId: string): void { // this should be called in case of events.delete as well
    const editableAccountMap: Map<string, SystemStream> = SystemStreamsSerializer.getEditableAccountMap();
    if (editableAccountMap[streamId] == null) {
      // if user tries to add new streamId from non editable streamsIds
      throw errors.invalidOperation(
        ErrorMessages[ErrorIds.ForbiddenAccountEventModification],
        { streamId: streamId }
      );
    }
  }

  /**
   * Forbid event editing if user tries to add multiple account streams
   * to the same event
   */
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
   * b) oldContentStreamIds: array<string>
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

    const limit = 500;
    
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
  async function attachFiles(context: MethodContext, eventInfo: {}, files) {
    if (!files) { return; }

    var attachments = eventInfo.attachments ? eventInfo.attachments.slice() : [];
    let i;
    let fileInfo;
    const filesKeys = Object.keys(files);
    for (i = 0; i < filesKeys.length; i++) {
      //saveFile
      fileInfo = files[filesKeys[i]];
      const fileId = await bluebird.fromCallback(cb =>
        userEventFilesStorage.saveAttachedFile(fileInfo.path, context.user, eventInfo.id, cb));

      attachments.push({
        id: fileId,
        fileName: fileInfo.originalname,
        type: fileInfo.mimetype,
        size: fileInfo.size
      });
      // approximately update account storage size
      context.user.storageUsed.attachedFiles += fileInfo.size;
      
      await usersRepository.updateOne(
        context.user,
        { attachedFiles: context.user.storageUsed.attachedFiles },
        context.access.id,
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
      if (!context.oldContent.trashed) {
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
  async function sendUpdateToServiceRegister (user, event, accountStreamId) {
    if (config.get('dnsLess:isActive')) {
      return;
    }
    const editableAccountStreamsMap = SystemStreamsSerializer.getEditableAccountMap();
    const streamIdWithoutPrefix = SystemStreamsSerializer.removePrefixFromStreamId(accountStreamId);
    if (editableAccountStreamsMap[accountStreamId].isUnique) {
      // send information update to service regsiter
      await serviceRegisterConn.updateUserInServiceRegister(
        user.username, {}, { [streamIdWithoutPrefix]: event.content}, { [streamIdWithoutPrefix]: event.content});
    }
  }
  
  async function flagAsTrashed(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const updatedData = {
      trashed: true
    };
    context.updateTrackingProperties(updatedData);
    try {
      if (context.doesEventBelongToAccountStream){
        await sendUpdateToServiceRegister(
          context.user,
          context.oldContent,
          context.accountStreamId,
        );
      }
      const updatedEvent = await bluebird.fromCallback(cb =>
        userEventsStorage.updateOne(context.user, { _id: params.id }, updatedData, cb));

      // if update was not done and no errors were catched
      //, perhaps user is trying to edit account streams
      if (!updatedEvent) {
        return next(errors.invalidOperation(
          ErrorMessages[ErrorIds.ForbiddenAccountEventModification]));
      }

      // To remove when streamId not necessary
      updatedEvent.streamId = updatedEvent.streamIds[0];

      result.event = updatedEvent;
      setFileReadToken(context.access, result.event);

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
        // If needed, approximately update account storage size
        if (! context.user.storageUsed || ! context.user.storageUsed.attachedFiles) {
          return;
        }
        context.user.storageUsed.attachedFiles -= getTotalAttachmentsSize(context.event.attachments);
        await usersRepository.updateOne(
          context.user,
          context.user.storageUsed,
          context.access.id,
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
        const deletedAtt = context.event.attachments[attIndex];
        context.event.attachments.splice(attIndex, 1);

        const updatedData = { attachments: context.event.attachments };
        context.updateTrackingProperties(updatedData);

        const alreadyUpdatedEvent = await bluebird.fromCallback(cb =>
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
        setFileReadToken(context.access, result.event);

        await bluebird.fromCallback(cb => userEventFilesStorage.removeAttachedFile(context.user, params.id, params.fileId, cb));

        // approximately update account storage size
        context.user.storageUsed.attachedFiles -= deletedAtt.size;
        await usersRepository.updateOne(
          context.user,
          context.user.storageUsed,
          context.access.id,
        );
        notifications.eventsChanged(context.user);
        next();
      } catch (err) {
        next(err);
      }
    });


  async function checkEventForDelete(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const eventId = params.id;
    
    let event;
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
      
    let canDeleteEvent = false;

    for (let i = 0; i < event.streamIds.length; i++) {
      if (await context.access.canUpdateEventsOnStreamAndWIthTags(event.streamIds[i], event.tags)) {
        canDeleteEvent = true;
        break;
      }
    }
    if (!canDeleteEvent) return next(errors.forbidden());
    // save event from the database as an oldContent
    context.oldContent = event;

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
    if (context.oldContent.streamIds.includes(STREAM_ID_ACTIVE)) return next(errors.invalidOperation(ErrorMessages[ErrorIds.ForbiddenAccountEventModification])); 
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
   * @param event
   */
  function setFileReadToken(access, event): void {
    if (! event.attachments) { return; }
    event.attachments.forEach(function (att) {
      att.readToken = utils.encryption
        .fileReadToken(att.id, 
          access.id, access.token,
          authSettings.filesReadTokenSecret);
    });
  }

  /**
   * Build request and send data to service-register about unique or indexed fields update
   * @param {MethodContext} context 
   * @param {boolean} isCreation 
   * @param {Map<string, SystemStream>} editableAccountStreamsMap 
   */
  async function sendDataToServiceRegister(context: MethodContext, isCreation: boolean, editableAccountStreamsMap: Map<string, SystemStream>) {
    // send update to service-register
    if (config.get('dnsLess:isActive')) {
      return;
    }
    const fieldsForUpdate = {};
    const streamIdWithoutPrefix = SystemStreamsSerializer.removePrefixFromStreamId(context.accountStreamId);

    // for isActive, "context.removeActiveEvents" is not enough because, it would be set 
    // to false if old event was active and is still active (no change)
    fieldsForUpdate[streamIdWithoutPrefix] = [{
      value: context.content.content,
      isUnique: editableAccountStreamsMap[context.accountStreamId].isUnique,
      isActive: (
        context.content.streamIds.includes(STREAM_ID_ACTIVE) ||
        context.oldContent.streamIds.includes(STREAM_ID_ACTIVE)),
      creation: isCreation
    }];

    // send information update to service regsiter
    await serviceRegisterConn.updateUserInServiceRegister(
      context.user.username,
      fieldsForUpdate,
      {},
      {[streamIdWithoutPrefix] : context.content.content}
    );
  }
};



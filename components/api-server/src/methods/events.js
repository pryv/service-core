/**
 * @license
 * Copyright (C) 2012-2022 Pryv S.A. https://pryv.com - All Rights Reserved
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
const _ = require('lodash');
const SetFileReadTokenStream = require('./streams/SetFileReadTokenStream');
const SetSingleStreamIdStream = require('./streams/SetSingleStreamIdStream');
const addTagsStream = require('./streams/AddTagsStream');

const { getMall, streamsUtils } = require('mall');
const SystemStreamsSerializer = require('business/src/system-streams/serializer');
const Registration = require('business/src/auth/registration');
const { getUsersRepository } = require('business/src/users');
const ErrorIds = require('errors/src/ErrorIds');
const ErrorMessages = require('errors/src/ErrorMessages');
const APIError = require('errors/src/APIError');
const assert = require('assert');
const MultiStream = require('multistream');

const eventsGetUtils = require('./helpers/eventsGetUtils');

const { getAPIVersion } = require('middleware/src/project_version');

const {TypeRepository, isSeriesType} = require('business').types;

const { getLogger, getConfig } = require('@pryv/boiler');
const { getStorageLayer } = require('storage');
const { getPlatform } = require('platform');

const { pubsub } = require('messages');

const BOTH_STREAMID_STREAMIDS_ERROR = 'It is forbidden to provide both "streamId" and "streamIds", please opt for "streamIds" only.';

const { convertStreamIdsToOldPrefixOnResult, changeMultipleStreamIdsPrefix, changeStreamIdsPrefixInStreamQuery, 
  TAG_PREFIX, TAG_ROOT_STREAMID,
  replaceTagsWithStreamIds, putOldTags } = require('./helpers/backwardCompatibility');
const { integrity } = require('business');

import type { MethodContext } from 'business';
import type { ApiCallback } from 'api-server/src/API';

// for typing
import type { Attachment, Event } from 'business/src/events';
import type { Stream } from 'business/src/streams';
import type { SystemStream } from 'business/src/system-streams';

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
  const userEventFilesStorage = storageLayer.eventFiles;
  const userStreamsStorage = storageLayer.streams;
  const authSettings = config.get('auth');
  const eventTypesUrl = config.get('service:eventTypes');
  const auditSettings = config.get('versioning');
  const updatesSettings = config.get('updates');
  const openSourceSettings = config.get('openSource')
  const usersRepository = await getUsersRepository(); 
  const mall = await getMall();
  const platform = await getPlatform();
  await eventsGetUtils.init();
  
  // Initialise the project version as soon as we can. 
  const version = await getAPIVersion();
  
  // Update types and log error
  typeRepo.tryUpdate(eventTypesUrl, version)
    .catch((err) => getLogger('typeRepo').warn(err));
    
  const logger = getLogger('methods:events');

  const STREAM_ID_ACTIVE: string = SystemStreamsSerializer.options.STREAM_ID_ACTIVE;

  const isStreamIdPrefixBackwardCompatibilityActive: boolean = config.get('backwardCompatibility:systemStreams:prefix:isActive');
  const isTagsBackwardCompatibilityActive: boolean = config.get('backwardCompatibility:tags:isActive');

  // RETRIEVAL
  api.register('events.get',
    eventsGetUtils.coerceStreamsParam,
    commonFns.getParamsValidation(methodsSchema.get.params),
    eventsGetUtils.applyDefaultsForRetrieval,
    applyTagsDefaultsForRetrieval,
    eventsGetUtils.transformArrayOfStringsToStreamsQuery,
    eventsGetUtils.validateStreamsQueriesAndSetStore,
    changeStreamIdsPrefixInStreamQuery.bind(null, isStreamIdPrefixBackwardCompatibilityActive), // using currying to pass "isStreamIdPrefixBackwardCompatibilityActive" argument
    eventsGetUtils.streamQueryCheckPermissionsAndReplaceStars,
    eventsGetUtils.streamQueryAddForcedAndForbiddenStreams,
    eventsGetUtils.streamQueryExpandStreams,
    eventsGetUtils.streamQueryAddHiddenStreams,
    migrateTagsToStreamQueries,
    eventsGetUtils.findEventsFromStore.bind(null, authSettings.filesReadTokenSecret, 
      isStreamIdPrefixBackwardCompatibilityActive, isTagsBackwardCompatibilityActive),
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

  /**
   * Backward compatibility for tags
   */
  function migrateTagsToStreamQueries(context: MethodContext, params: GetEventsParams, result: Result, next: ApiCallback) {
    if (! isTagsBackwardCompatibilityActive) return next();
    if (params.tags == null) return next();

    for (const query: StreamQuery of params.arrayOfStreamQueriesWithStoreId) {
      if (query.storeId === 'local') {
        if (query.and == null) query.and = [];
        query.and.push({any: params.tags.map(t => TAG_PREFIX + t)})
      }  
    }
    
    next();
  }


  async function includeLocalStorageDeletionsIfRequested(context, params, result, next) {

    if (params.modifiedSince == null || !params.includeDeletions) {
      return next();
    }

    // to be implemented also for stores that support deletion later on 
    const localDeletionsStreams = await mall.events.getStreamedWithParamsByStore(context.user.id, 
      { local: { skip: params.skip, limit: params.limit, deletedSince: params.modifiedSince}});

    result.addStream('eventDeletions', localDeletionsStreams);
    next();
  }

  api.register('events.getOne',
    commonFns.getParamsValidation(methodsSchema.getOne.params),
    findEvent,
    checkIfAuthorized,
    backwardCompatibilityOnResult,
    includeHistoryIfRequested
  );

  async function findEvent(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      const event = await mall.events.getOne(context.user.id, params.id);
      if (event == null) return next(errors.unknownResource('event', params.id));
      context.event = event;
      next();
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
  }

  async function checkIfAuthorized(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (! context.event) return next();
    let event: Event = context.event;
    delete context.event;

    const systemStreamIdsForbiddenForReading = SystemStreamsSerializer.getAccountStreamsIdsForbiddenForReading();

    let canReadEvent: boolean = false;
    for (const streamId of event.streamIds) { // ok if at least one
      if (systemStreamIdsForbiddenForReading.includes(streamId)) {
        canReadEvent = false;
        break;
      }

      if (await context.access.canGetEventsOnStreamAndWithTags(streamId, event.tags)) {
        canReadEvent = true;
      }
    }
    // might return 404 to avoid discovery of existing forbidden events 
    if (! canReadEvent) return next(errors.forbidden());

    event.attachments = setFileReadToken(context.access, event.attachments);

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

    // history is fetched in an extra step due to initial implementation,
    // now that mall.events.get return all in a single call, it coul be implement all at once

    try {
      const events = await mall.events.get(context.user.id, {state: 'all', includeDeletions: true, headId: params.id});
   
      result.history = [];
     
      events.forEach(e => {
         // To remove when streamId not necessary
        _applyBackwardCompatibilityOnEvent(e, context);
        if (e.headId != null) {
          result.history.push(e);
        }
      });
        
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
    createStreamsForTagsIfNeeded,
    validateEventContentAndCoerce,
    verifycanCreateEventsOnStreamAndWIthTags,
    doesEventBelongToAccountStream,
    validateSystemStreamsContent,
    validateAccountStreamsForCreation,
    appendAccountStreamsDataForCreation,
    createOnPlatform,
    handleSeries,
    createEvent,
    removeActiveFromSibling,
    createAttachments,
    backwardCompatibilityOnResult,
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
   * register this new information on the platform
   */
  async function createOnPlatform(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if(! context.doesEventBelongToAccountStream) {
      return next();
    }

    try{
      if (context.systemStream.isUnique) {
        await usersRepository.checkDuplicates({[context.accountStreamIdWithoutPrefix]: context.newEvent.content});
      }
      if (context.systemStream.isIndexed) { // assume can be unique as per test #42A1
        const operations = [{ 
          action: 'create', 
          key: context.accountStreamIdWithoutPrefix,
          value: context.newEvent.content,
          isUnique: context.systemStream.isUnique,
        }];

        await platform.updateUserAndForward(context.user.username, operations, 
          context.newEvent.streamIds.includes(STREAM_ID_ACTIVE) || // WTF
          context.oldEvent.streamIds.includes(STREAM_ID_ACTIVE),
          true);
      }
      
    } catch (err) {
      return next(err);
    }
    next();
  }

  /**
   * register this new information on the platform
   */
   async function updateOnPlatform(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if(! context.doesEventBelongToAccountStream) {
      return next();
    }

    try{
      if (context.systemStream.isUnique) {
        await usersRepository.checkDuplicates({[context.accountStreamIdWithoutPrefix]: context.newEvent.content});
      }
      if (context.systemStream.isIndexed) { // assume can be unique as per test #42A1
        const operations = [{ 
          action: 'update', 
          key: context.accountStreamIdWithoutPrefix,
          value: context.newEvent.content,
          previousValue: context.oldEvent.content,
          isUnique: context.systemStream.isUnique,
        }];

        await platform.updateUserAndForward(context.user.username, operations, 
          context.newEvent.streamIds.includes(STREAM_ID_ACTIVE) || // WTF
          context.oldEvent.streamIds.includes(STREAM_ID_ACTIVE),
          false);
      }
      
    } catch (err) {
      return next(err);
    }
    next();
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
      let newEvent = await mall.events.create(context.user.id, context.newEvent);
      // To remove when streamId not necessary
      newEvent.streamId = newEvent.streamIds[0];
      result.event = newEvent;
      return next();
    } catch (err) {
      if (err instanceof APIError) return next(err);
      return next(errors.unexpectedError(err));
    }
  }

  function backwardCompatibilityOnResult(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (result.event != null) _applyBackwardCompatibilityOnEvent(result.event, context)
    next();
  }

  function _applyBackwardCompatibilityOnEvent(event, context) {
    if (isStreamIdPrefixBackwardCompatibilityActive && ! context.disableBackwardCompatibility) {
      convertStreamIdsToOldPrefixOnResult(event);
    }
    if (isTagsBackwardCompatibilityActive) event = putOldTags(event);
    event.streamId = event.streamIds[0];
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
      const updatedEvent = await mall.events.update(context.user.id, result.event);

      // To remove when streamId not necessary
      updatedEvent.streamId = updatedEvent.streamIds[0];   
      result.event = updatedEvent;
      result.event.attachments = setFileReadToken(context.access, result.event.attachments);
      next();
        
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
      if (process.env.NODE_ENV === 'test' && ! openSourceSettings.isActive && integrity.events.isActive) {
        // double check integrity when running tests only
        if (result.event.integrity != integrity.events.hash(result.event)) {
          return next(new Error('integrity mismatch' + JSON.stringify(result.event)));
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
    createStreamsForTagsIfNeeded,
    validateEventContentAndCoerce,
    doesEventBelongToAccountStream,
    validateSystemStreamsContent,
    validateAccountStreamsForUpdate,
    generateVersionIfNeeded,
    updateAttachments,
    appendAccountStreamsDataForUpdate,
    updateOnPlatform,
    updateEvent,
    backwardCompatibilityOnResult,
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

    try {
      event = await mall.events.getOne(context.user.id, params.id);
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

    // clientData key-map handling 
    if (eventUpdate.clientData != null) {
      context.newEvent.clientData = _.cloneDeep(context.oldEvent.clientData || {});
      for (const [key, value] of Object.entries(eventUpdate.clientData)) {
        if (value == null) { // delete keys with null value
          delete context.newEvent.clientData[key]; 
        } else { // update or add keys
          context.newEvent.clientData[key] = value;
        }
      }
    }
 
    next();

    function hasStreamIdsModification(event: Event): boolean {
      return event.streamIds != null;
    }
  }

  /**
   * Depends on context.oldEvent
   */
  async function generateVersionIfNeeded(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    if (! auditSettings.forceKeepHistory) {
      return next();
    }

    const versionEvent = _.clone(context.oldEvent);
    versionEvent.headId = context.oldEvent.id;
    delete versionEvent.id;
    // otherwise the history value will squat
    removeUniqueStreamId(versionEvent);
    try {
      await mall.events.create(context.user.id, versionEvent);
    } catch (err) {
      if (err instanceof APIError) return next(err);
      return next(errors.unexpectedError(err));
    }
    return next();

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
      const updatedEvent = await mall.events.update(context.user.id, context.newEvent);

      // if update was not done and no errors were catched
      //, perhaps user is trying to edit account streams
      if (!updatedEvent) {
        return next(errors.invalidOperation(
          ErrorMessages[ErrorIds.ForbiddenAccountEventModification])); // WTF this was checked earlier
      }
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
    const query = {streams: [{any: [context.accountStreamId], and: [{any: [STREAM_ID_ACTIVE]}]}]};

    const filter = function(eventData) {
      return eventData.id != result.event.id;
    }

    const updatedEvents = await mall.events.updateMany(context.user.id, query, { filter: filter, removeStreams: [STREAM_ID_ACTIVE]});
   

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

    if (isTagsBackwardCompatibilityActive) context.newEvent = replaceTagsWithStreamIds(context.newEvent);

    // Unknown types can just be created as normal events. 
    if (! typeRepo.isKnown(type)) {
      // We forbid the 'series' prefix for these free types. 
      if (isSeriesType(type)) return next(errors.invalidEventType(type));

      // No further checks, let the user do what he wants. 
      return next();
    }
        
    // assert: `type` is known
    
    if (isSeriesType(type)) {
      // Series cannot have content on update, not here at least.
      if (isCreateSeriesAndHasContent(params) || isUpdateSeriesAndHasContent(params)) {
        return next(errors.invalidParametersFormat('The event content\'s format is invalid.', 'Events of type High-frequency have a read-only content'));
      }
      return next();
    }

    try {
      await typeRepo.validate(context.newEvent);
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

  function validateSystemStreamsContent(context: MethodContext, params: GetEventsParams, result: Result, next: ApiCallback) {
    if (! context.doesEventBelongToAccountStream) return next();
    if (context.newEvent == null) return next();

    const acceptedIndexedTypes: Array<string> = ['number', 'string', 'undefined'];

    const contentType: string = typeof context.newEvent.content;
    if (! acceptedIndexedTypes.includes(contentType)) return next(errors.invalidParametersFormat(ErrorMessages.IndexedParameterInvalidFormat, params));

    return next();
  }

  /**
   * If they don't exist, create the streams for the present tags
   */
  async function createStreamsForTagsIfNeeded(context: MethodContext, params: GetEventsParams, result: Result, next: ApiCallback) {
    if (! isTagsBackwardCompatibilityActive) return next();
    
    const tags: ?Array<string> = context.newEvent.tags;
    if (tags == null) return next();
    const streams: Array<Promise> = [];
    for(const tag: string of tags) {
      // weirdly context.streamForStreamId does not behave like a Promise, so we execute it in the for loop
      streams.push(await context.streamForStreamId(TAG_PREFIX + tag, 'local'));
    }    
    const streamIdsToCreate: Array<string> = (_.cloneDeep(tags)).map(t => TAG_PREFIX + t);
    for(const stream: ?Stream of streams) {
      if (stream != null) streamIdsToCreate.splice(streamIdsToCreate.indexOf(stream.id), 1);
    }
    const streamsToCreate: Array<Promise<void>> = [];
    for(const streamId: string of streamIdsToCreate) {
      const newStream: Stream = context.initTrackingProperties({
        id: streamId,
        name: streamId,
        parentId: TAG_ROOT_STREAMID,
      });
      streamsToCreate.push(bluebird.fromCallback(cb =>  userStreamsStorage.insertOne(context.user, newStream, cb)));
    }
    const streamsCreatedResults: Array<{}> = await Promise.allSettled(streamsToCreate);
    const streamIdsCreated: Array<string> = streamsCreatedResults.map(r => {
      if (r.status === 'fulfilled') return r.value.id;
    });
    
    if (streamIdsCreated.length > 0) logger.info('backward compatibility: created streams for tags: ' + streamIdsCreated);
    
    next();
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
  async function updateDeletionOnPlatform (username, content, accountStreamId) {
    const editableAccountStreamsMap: Map<string, SystemStream> = SystemStreamsSerializer.getEditableAccountMap();
    const streamIdWithoutPrefix: string = SystemStreamsSerializer.removePrefixFromStreamId(accountStreamId);
    if (editableAccountStreamsMap[accountStreamId].isUnique) { // TODO should be isIndexed??
      
      const operations = [{ 
        action: 'delete',
        key: streamIdWithoutPrefix,
        value: content,
        isUnique: true
      }]

      await platform.updateUserAndForward(username, operations);

    }
  }
  
  async function flagAsTrashed(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const newEvent = _.cloneDeep(context.oldEvent);
    newEvent.trashed = true;
    context.updateTrackingProperties(newEvent);
    try {
      if (context.doesEventBelongToAccountStream){
        await updateDeletionOnPlatform(
          context.user.username,
          context.oldEvent.content,
          context.accountStreamId,
        );
      }

      
      const updatedEvent = await mall.events.update(context.user.id, newEvent);

      // if update was not done and no errors were catched
      //, perhaps user is trying to edit account streams ---- WTF
      if (updatedEvent == null) {
        return next(errors.invalidOperation(
          ErrorMessages[ErrorIds.ForbiddenAccountEventModification]));
      }

      _applyBackwardCompatibilityOnEvent(updatedEvent, context);

      result.event = updatedEvent;
      result.event.attachments = setFileReadToken(context.access, result.event.attachments);

      next();
    } catch (err) {
      return next(errors.unexpectedError(err));
    }
  }

  function deleteWithData(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    async.series([
      async function deleteHistoryCompletely() {
        if (auditSettings.deletionMode !== 'keep-nothing') return ;
        
        await mall.events.delete(context.user.id, {headId: params.id, state: 'all'});
      },
      async function minimizeHistory() {
        if (auditSettings.deletionMode !== 'keep-authors') {
          return ;
        }
        await mall.events.updateMinimizeEventHistory(context.user.id, params.id);
      },
      async function deleteEvent() {
        const res = await mall.events.updateDeleteByMode(context.user.id, auditSettings.deletionMode, {id: params.id, state: 'all'});
        result.eventDeletion = { id: params.id };
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
    deleteAttachment,
    backwardCompatibilityOnResult);

  async function deleteAttachment (context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    try {
      const attIndex = getAttachmentIndex(context.event.attachments, params.fileId);
      if (attIndex === -1) {
        return next(errors.unknownResource(
          'attachment', params.fileId
        ));
      }
      const deletedAtt: Attachment = context.event.attachments[attIndex];
      context.event.attachments.splice(attIndex, 1);

      const newEvent = _.cloneDeep(context.oldEvent);
      newEvent.attachments = context.event.attachments;
      context.updateTrackingProperties(newEvent);

      const alreadyUpdatedEvent = await mall.events.update(context.user.id, newEvent);

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
  };

  async function checkEventForDelete(context: MethodContext, params: mixed, result: Result, next: ApiCallback) {
    const eventId: string = params.id;
    
    let event: ?Event;
    try {
      event = await mall.events.getOne(context.user.id, eventId);
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



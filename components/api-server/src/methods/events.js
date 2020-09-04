/**
 * @license
 * Copyright (C) 2020 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */

var cuid = require('cuid'),
  utils = require('components/utils'),
  errors = require('components/errors').factory,
  async = require('async'),
  bluebird = require('bluebird'),
  commonFns = require('./helpers/commonFunctions'),
  methodsSchema = require('../schema/eventsMethods'),
  eventSchema = require('../schema/event'),
  querying = require('./helpers/querying'),
  timestamp = require('unix-timestamp'),
  treeUtils = utils.treeUtils,
  _ = require('lodash'),
  SetFileReadTokenStream = require('./streams/SetFileReadTokenStream');

const SystemStreamsSerializer = require('components/business/src/system-streams/serializer'),
  ServiceRegister = require('components/business/src/auth/service_register'),
  Registration = require('components/business/src/auth/registration'),
  UserRepository = require('components/business/src/users/repository');

const { getConfig } = require('components/api-server/config/Config');
const assert = require('assert');

const { ProjectVersion } = require('components/middleware/src/project_version');

const {TypeRepository, isSeriesType} = require('components/business').types;


const NATS_CONNECTION_URI = require('components/utils').messaging.NATS_CONNECTION_URI;
const NATS_UPDATE_EVENT = require('components/utils').messaging
  .NATS_UPDATE_EVENT;
const NATS_DELETE_EVENT = require('components/utils').messaging
  .NATS_DELETE_EVENT;

const BOTH_STREAMID_STREAMIDS_ERROR = 'It is forbidden to provide both "streamId" and "streamIds", please opt for "streamIds" only.';

// Type repository that will contain information about what is allowed/known
// for events. 
const typeRepo = new TypeRepository(); 

/**
 * Events API methods implementations.
 * @param auditSettings
 */
module.exports = function (
  api, userEventsStorage, userEventFilesStorage,
  authSettings, eventTypesUrl, notifications, logging,
  auditSettings, updatesSettings, openSourceSettings, servicesSettings
) {

  const userRepository = new UserRepository(userEventsStorage);

  // Initialise the project version as soon as we can. 
  const pv = new ProjectVersion();
  let version = pv.version();
  
  // Update types and log error
  typeRepo.tryUpdate(eventTypesUrl, version)
    .catch((err) => logging.getLogger('typeRepo').warn(err));
    
  const logger = logging.getLogger('methods/events');
  
  let natsPublisher;
  if (!openSourceSettings.isActive) {
    const NatsPublisher = require('../socket-io/nats_publisher');
    natsPublisher = new NatsPublisher(NATS_CONNECTION_URI);
  }

  // RETRIEVAL

  api.register('events.get',
    commonFns.getParamsValidation(methodsSchema.get.params),
    applyDefaultsForRetrieval,
    findAccessibleEvents,
    includeDeletionsIfRequested);

  async function applyDefaultsForRetrieval (context, params, result, next) {
    _.defaults(params, {
      streams: null,
      tags: null,
      types: null,
      fromTime: null,
      toTime: null,
      sortAscending: false,
      skip: null,
      limit: null,
      state: 'default',
      modifiedSince: null,
      includeDeletions: false
    }); 
    if (params.fromTime == null && params.toTime != null) {
      params.fromTime = timestamp.add(params.toTime, -24 * 60 * 60);
    }
    if (params.fromTime != null && params.toTime == null) {
      params.toTime = timestamp.now();
    }
    if (params.fromTime == null && params.toTime == null && params.limit == null) {
      // limit to 20 items by default
      params.limit = 20;
    }

    if (params.streams != null) {
      var expandedStreamIds = treeUtils.expandIds(context.streams, params.streams);
      var unknownIds = _.difference(params.streams, expandedStreamIds);

      if (unknownIds.length > 0) {
        return next(errors.unknownReferencedResource(
          'stream' + (unknownIds.length > 1 ? 's' : ''),
          'streams', 
          unknownIds));
      }

      params.streams = expandedStreamIds;
    }
    if (params.state === 'default') {
      // exclude events in trashed streams
      var nonTrashedStreamIds = treeUtils.collectPluck(
        treeUtils.filterTree(
          context.streams, false, (s) => { return ! s.trashed; }), 
        'id');
      params.streams = params.streams 
        ? _.intersection(params.streams, nonTrashedStreamIds) 
        : nonTrashedStreamIds;
    }

    if (! context.access.canReadAllStreams()) {
      var accessibleStreamIds = [];

      Object.keys(context.access.streamPermissionsMap).map((streamId) => {
        if (context.access.canReadStream(streamId)) {
          accessibleStreamIds.push(streamId);
        }
      });
      params.streams = params.streams 
        ? _.intersection(params.streams, accessibleStreamIds) 
        : accessibleStreamIds;
    } else if (params.streams && !context.access.isPersonal()) {
      // allow account stream events access only with personal token or specific access
      let allAccountStreamIds = SystemStreamsSerializer.getAllAccountStreamsIdsForAccess();
      let notAccessibleStreamIds = allAccountStreamIds;

      Object.keys(context.access.streamPermissionsMap).map((streamId) => {
        if (allAccountStreamIds.includes(streamId) &&
          context.access.canReadAccountStream(streamId)) {
          notAccessibleStreamIds.splice(notAccessibleStreamIds.indexOf(streamId), 1);
        }
      });
      params.streams = params.streams.filter(function (streamId) {
        return notAccessibleStreamIds.indexOf(streamId) < 0;
      });
    }

    if (! context.access.canReadAllTags()) {
      var accessibleTags = Object.keys(context.access.tagPermissionsMap);
      params.tags = params.tags 
        ? _.intersection(params.tags, accessibleTags) 
        : accessibleTags;
    }
    next();
  }

  /**
   * Remove events that belongs to the account streams and should not be displayed
   * @param query -mongo query object  
   */
  function removeNotReadableAccountStreamsFromQuery (query) {
    // get streams ids from the config that should be retrieved
    const userAccountStreams = SystemStreamsSerializer.getAccountStreamsIdsForbiddenForReading();
    query.streamIds = { ...query.streamIds, ...{ $nin: userAccountStreams } };

    return query;
  }

  async function findAccessibleEvents(context, params, result, next) {
    // build query
    var query = querying.noDeletions(querying.applyState({}, params.state));

    if (params.streams) {
      query.streamIds = {$in: params.streams};
    }
    query = removeNotReadableAccountStreamsFromQuery(query);

    if (params.tags && params.tags.length > 0) {
      query.tags = {$in: params.tags};
    }
    if (params.types && params.types.length > 0) {
      // unofficially accept wildcard for sub-type parts
      var types = params.types.map(getTypeQueryValue);
      query.type = {$in: types};
    }
    if (params.running) {
      query.duration = {'$type' : 10}; // matches when duration exists and is null
    }
    if (params.fromTime != null) {
      query.$or = [
        { // Event started before fromTime, but finished inside from->to.
          time: {$lt: params.fromTime},
          endTime: {$gte: params.fromTime}
        },
        { // Event has started inside the interval.
          time: { $gte: params.fromTime, $lte: params.toTime }
        },
      ];
    }
    if (params.toTime != null) {
      _.defaults(query, {time: {}});
      query.time.$lte = params.toTime;
    }
    if (params.modifiedSince != null) {
      query.modified = {$gt: params.modifiedSince};
    }

    var options = {
      projection: params.returnOnlyIds ? {id: 1} : {},
      sort: { time: params.sortAscending ? 1 : -1 },
      skip: params.skip,
      limit: params.limit
    };

    userEventsStorage.findStreamed(context.user, query, options, function (err, eventsStream) {
      if (err) {
        return next(errors.unexpectedError(err));
      }

      result.addStream('events', eventsStream
        .pipe(new SetFileReadTokenStream(
          {
            access: context.access,
            filesReadTokenSecret: authSettings.filesReadTokenSecret
          }
        ))
      );
      
      next();
    });
  }

  function includeDeletionsIfRequested(context, params, result, next) {

    if (params.modifiedSince == null || !params.includeDeletions) {
      return next();
    }

    var options = {
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
    includeHistoryIfRequested
  );

  function findEvent (context, params, result, next) {
    const query = removeNotReadableAccountStreamsFromQuery({ id: params.id });
    userEventsStorage.findOne(context.user, query, null, function (err, event) {
      if (err) {
        return next(errors.unexpectedError(err));
      }

      if (! event) {
        return next(errors.unknownResource('event', params.id));
      }

      let canReadEvent = false;
      for (let i = 0; i < event.streamIds.length; i++) { // ok if at least one
        if (context.canReadContext(event.streamIds[i], event.tags)) {
          canReadEvent = true;
          break;
        }
      }
      if (! canReadEvent) return next(errors.forbidden());

      setFileReadToken(context.access, event);

      // To remove when streamId not necessary
      event.streamId = event.streamIds[0];

      // remove event values used for enforcing uniqness in database level
      // (the fields are formed "streamId + __unique")
      event = Object.keys(event)
        .filter(key => ! /__unique/.test(key))
        .reduce((obj, key) => {
          obj[key] = event[key];
          return obj;
        }, {});
      
      result.event = event;
      return next();
    });
  }

  function includeHistoryIfRequested(context, params, result, next) {
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
    verifycanContributeToContext,
    createEvent,
    createAttachments,
    notify);

  function applyPrerequisitesForCreation(context, params, result, next) {
    const event = context.content;
    // default time is now
    _.defaults(event, { time: timestamp.now() });
    if (! event.tags) {
      event.tags = [];
    }
    
    cleanupEventTags(event);
    
    context.files = sanitizeRequestFiles(params.files);
    delete params.files;

    context.initTrackingProperties(event);
    
    context.content = event;
    next();
  }

  function verifycanContributeToContext (context, params, result, next) {
    for (let i = 0; i < context.content.streamIds.length; i++) { // refuse if any context is not accessible
      if (! context.canContributeToContext(context.content.streamIds[i], context.content.tags)) {
        return next(errors.forbidden());
      }
    }
    next();
  }

  async function createEvent(
    context, params, result, next) 
  {
    let accountStreamsInfo = { removeActiveEvents: false };
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
    } else {
      // if event belongs to the account streams, apply additional actions
      try {
        accountStreamsInfo = await handleAccountStreams(context.user.username, context, true);
        context.content = accountStreamsInfo.context;
      } catch (err) {
        return next(err);
      }
    }

    userEventsStorage.insertOne(
      context.user, context.content, function (err, newEvent) {
        if (err != null) {
          // Expecting a duplicate error
          if (err.isDuplicateIndex('id')) {
            return next(errors.itemAlreadyExists('event', {id: params.id}, err));
          }
          // Expecting a duplicate error for unique fields
          if (err.isDuplicate) {
            return next(commonFns.apiErrorToValidationErrorsList(
              [errors.existingField(err.duplicateIndex())]));
          }
          // Any other error
          return next(errors.unexpectedError(err));
        }

        // To remove when streamId not necessary
        newEvent.streamId = newEvent.streamIds[0];

        if (accountStreamsInfo.removeActiveEvents) {
          handleEventsWithActiveStreamId(context.user, newEvent.streamId, newEvent.id);
        }
        // remove redundant field for the result that enforces uniqness
        newEvent = removeUniqueFields(newEvent)
        result.event = newEvent;
        next();
      });
  }

  /**
   * Append properties like streamId and additional field to event
   * that helps to enforce uniqness
   * @param object contextContent 
   * @param string fieldName 
   */
  function enforceEventUniqueness (contextContent: object, fieldName: string) {
    if (!contextContent.streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_UNIQUE)) {
      contextContent.streamIds.push(SystemStreamsSerializer.options.STREAM_ID_UNIQUE);
    }
    contextContent[`${SystemStreamsSerializer.removeDotFromStreamId(fieldName)}__unique`] = contextContent.content;
    return contextContent;
  }

  /**
   * Do additional actions if event belongs to the account stream and is
   * 1) unique
   * 2) indexed
   * 3) active
   * Additional actions like
   * a) adding property to enforce uniqness
   * b) sending data update to service-regsiter
   * c) saving streamId 'active' has to be handles in the different way that
   * for all other events
   *
   * @param string username 
   * @param object contextContent 
   * @param boolean creation - if true - active streamId will be added by default
   */
  async function handleAccountStreams (username:string, context: object, creation: Boolean) {
    // get editable account streams
    const editableAccountStreams = SystemStreamsSerializer.getEditableAccountStreams();

    /**
     * Deny event editing if event has non editable core stream
     * @param string streamId 
     */
    function checkIfStreamIdIsNotEditable (streamId: string): boolean {
      const nonEditableAccountStreamsIds = SystemStreamsSerializer.getAccountStreamsIdsForbiddenForEditing();
      return nonEditableAccountStreamsIds.includes(streamId);
    }

    /**
     * Form request and send data to service-register about unique or indexed fields update
     * @param {*} fieldName 
     * @param {*} contextContent 
     * @param {*} creation 
     */
    async function sendDataToServiceRegister (streamId, contextContent, creation) {
      let fieldsForUpdate = {};
      let streamIdWithoutDot = SystemStreamsSerializer.removeDotFromStreamId(streamId);
      fieldsForUpdate[streamIdWithoutDot] = [{
        value: contextContent.content,
        isUnique: editableAccountStreams[streamId].isUnique,
        isActive: contextContent.streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_ACTIVE) ||
          oldContentStreamIds.includes(SystemStreamsSerializer.options.STREAM_ID_ACTIVE),
        creation: creation
      }];

      // initialize service-register connection
      const serviceRegisterConn = new ServiceRegister(servicesSettings.register, logging.getLogger('service-register'));

      // send information update to service regsiter
      await serviceRegisterConn.updateUserInServiceRegister(
        username, fieldsForUpdate, {});
    }
 
    let removeActiveEvents = false;
    let contextContent = context.content;
    let oldContentStreamIds = (context?.oldContent?.streamIds) ? context.oldContent.streamIds: [];
    const fieldName = (typeof contextContent.streamIds === 'object')? contextContent.streamIds[0]: '';

    // check if event belongs to account stream ids
    const matchingAccountStreams = _.intersection(contextContent.streamIds, Object.keys(editableAccountStreams));
    if (matchingAccountStreams.length === 1 &&
      (creation || _.intersection(matchingAccountStreams, oldContentStreamIds).length >= 1)) {
      // check that account stream id was not changed

      // append active stream id if it is a new event 
      if (creation) {
        contextContent.streamIds.push(SystemStreamsSerializer.options.STREAM_ID_ACTIVE);
        // after event will be saved, active property will be removed from the other events
        removeActiveEvents = true;
      } else if (!oldContentStreamIds.includes(SystemStreamsSerializer.options.STREAM_ID_ACTIVE)
        && contextContent.streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_ACTIVE)) {
        // after event will be saved, active property will be removed from the other events
        removeActiveEvents = true;
      }

      if (editableAccountStreams[fieldName].isUnique || editableAccountStreams[fieldName].isIndexed) {
        
        // if stream is unique append properties that enforce uniqueness
        if (editableAccountStreams[fieldName].isUnique) {
          contextContent = enforceEventUniqueness(contextContent, fieldName);
        }
        // send update to service-register
        if (getConfig().get('singleNode:isActive') !== true) {
          await sendDataToServiceRegister(fieldName, contextContent, creation);
        }
      }
    } else if (checkIfStreamIdIsNotEditable(fieldName)) {
      // if user tries to add new streamId from non editable streamsIds
      throw errors.DeniedEventModification(fieldName);

    } else if (matchingAccountStreams.length > 1) {
      // if user tries to add several streamIds from account streams
      throw errors.DeniedMultipleAccountStreams(fieldName);

    } else if (!creation && matchingAccountStreams.length > 0 &&
      _.intersection(matchingAccountStreams, oldContentStreamIds).length === 0) {
      // if user tries to change streamId of systemStreams event
      throw errors.DeniedMultipleAccountStreams(fieldName);

    }
    
    return {
      context: contextContent,
      removeActiveEvents: removeActiveEvents
    };
  }

  /**
   * Creates the event's body according to its type and context. 
   */
  function createSeriesEventContent(context) {
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

  async function createAttachments (context, params, result, next) {
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
    generateLogIfNeeded,
    updateAttachments,
    updateEvent,
    notify);

  function applyPrerequisitesForUpdate(context, params, result, next) {

    const eventUpdate = context.content;
    
    cleanupEventTags(eventUpdate);

    context.updateTrackingProperties(eventUpdate);

    userEventsStorage.findOne(context.user, {id: params.id}, null, function (err, event) {
      if (err) {
        return next(errors.unexpectedError(err));
      }

      if (! event) {
        return next(errors.unknownResource('event', params.id));
      }

      // 1. check that have contributeContext on at least 1 existing streamId
      let canUpdateEvent = false;
      for (let i = 0; i < event.streamIds.length ; i++) {
        if (context.canUpdateContext(event.streamIds[i], event.tags)) {
          canUpdateEvent = true;
          break;
        }
      }
      if (! canUpdateEvent) return next(errors.forbidden());
      
      if (hasStreamIdsModification(eventUpdate)) {

        // 2. check that streams we add have contribute access
        const streamIdsToAdd = _.difference(eventUpdate.streamIds, event.streamIds);
        for (let i=0; i<streamIdsToAdd.length; i++) {
          if (! context.canUpdateContext(streamIdsToAdd[i], event.tags)) {
            return next(errors.forbidden());
          }
        }

        // 3. check that streams we remove have contribute access        
        // streamsToRemove = event.streamIds - eventUpdate.streamIds
        const streamIdsToRemove = _.difference(event.streamIds, eventUpdate.streamIds);

        for (let i = 0; i < streamIdsToRemove.length ; i++) {
          if (! context.canUpdateContext(streamIdsToRemove[i], event.tags)) {
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
    });

  }

  /**
   * Remove event properties that enforces uniqueness
   * @param object event 
   */
  function removeUniqueFields (event) {
    Object.keys(event).forEach(key => {
      if (key.match('__unique')) {
        delete event[key];
      }
    });
    return event;
  }

  function generateLogIfNeeded(context, params, result, next) {
    if (!auditSettings.forceKeepHistory) {
      return next();
    }

    context.oldContent = _.extend(context.oldContent, {headId: context.content.id});
    delete context.oldContent.id;
    context.oldContent = removeUniqueFields(context.oldContent);

    userEventsStorage.insertOne(context.user, context.oldContent, function (err) {
      if (err) {
        return next(errors.unexpectedError(err));
      }
      next();
    });
  }

  async function updateAttachments(context, params, result, next) {
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

  async function updateEvent (context, params, result, next) {
    let accountStreamsInfo = {};
    try {
      // if events belongs to system streams additional actions may be needed
      accountStreamsInfo = await handleAccountStreams(context.user.username, context, false);
      context.content = accountStreamsInfo.context;
    } catch (err) {
      return next(err);
    }

    try {
      let updatedEvent = await bluebird.fromCallback(cb =>
        userEventsStorage.updateOne(context.user, { _id: context.content.id }, context.content, cb));

      // if update was not done and no errors were catched
      //, perhaps user is trying to edit account streams
      if (!updatedEvent) {
        return next(errors.DeniedEventModification());
      }

      // To remove when streamId not necessary
      updatedEvent.streamId = updatedEvent.streamIds[0];

      // if it is needed update events from the same account stream
      if (accountStreamsInfo.removeActiveEvents) {
        handleEventsWithActiveStreamId(context.user, updatedEvent.streamId, updatedEvent.id);
      }

      updatedEvent = removeUniqueFields(updatedEvent);
      result.event = updatedEvent;
      setFileReadToken(context.access, result.event);

    } catch (err) {
      return next(Registration.handleUniquenessErrors(err, null, {
        [SystemStreamsSerializer.removeDotFromStreamId(context.content.streamIds[0])]: context.content.content
      }));
    };
    next();
  }


  /**
   * for account streams - 'active' streamId defines the 'main' event from the stream
   * if there are many events (like many emails), only one should be main/active
   * @param {*} user 
   * @param {*} streamId 
   * @param {*} eventIdToExclude 
   */
  async function handleEventsWithActiveStreamId (user, streamId, eventIdToExclude) {
    await bluebird.fromCallback(cb =>
      userEventsStorage.updateMany(user,
        {
          id: { $ne: eventIdToExclude },
          streamIds: { $all: [streamId, SystemStreamsSerializer.options.STREAM_ID_ACTIVE] }
        },
        { $pull: { streamIds: SystemStreamsSerializer.options.STREAM_ID_ACTIVE } }, cb));
  }

  function notify(context, params, result, next) {
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

  function normalizeStreamIdAndStreamIds(context, params, result, next) {
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

    // check that streamIds are known
    context.setStreamList(context.content.streamIds);

    if (event.streamIds != null && ! checkStreams(context, next)) return;
    
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
  function validateEventContentAndCoerce(context, params, result, next) {
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
      .then((newContent) => {
        // Store the coerced value. 
        context.content.content = newContent; 
        
        next();
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

  function cleanupEventTags(eventData) {      
    if (! eventData.tags) return;

    const limit = 500;
    
    eventData.tags = eventData.tags.map(function (tag) {
      if(tag.length > limit) {
        throw errors.invalidParametersFormat(
          'The event contains a tag that exceeds the size limit of ' +
           limit + ' characters.', tag);
      } 
      return tag.trim();
    }).filter(function (tag) { return tag.length > 0; });
  }

  /**
   * Checks that the context's stream exists and isn't trashed.
   * `context.setStream` must be called beforehand.
   *
   * @param {Object} context
   * @param {Function} errorCallback Called with the appropriate error if any
   * @return `true` if OK, `false` if an error was found.
   */
  function checkStreams (context, errorCallback) {
    if (context.streamIdsNotFoundList.length > 0 ) {
      errorCallback(errors.unknownReferencedResource(
        'stream', 'streamIds', context.streamIdsNotFoundList
      ));
      return false;
    }
    
    for (let i = 0; i < context.streamList.length; i++) {
      if (context.streamList[i].trashed) {
        errorCallback(errors.invalidOperation(
          'The referenced stream "' + context.streamList[i].id + '" is trashed.',
          {trashedReference: 'streamIds'}
        ));
        return false;
      }
    }

    return true;
  }

  /**
   * Saves the uploaded files (if any) as attachments, returning the corresponding attachments info.
   *
   * @param {Object} context
   * @param {Object} eventInfo Expected properties: id, attachments
   * @param files Express-style uploaded files object (as in req.files)
   */
  async function attachFiles (context, eventInfo, files) {
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
      
      await userRepository.updateOne(
        context.user.id,
        { attachedFiles: context.user.storageUsed.attachedFiles });
    }
    return attachments;
  }

  // DELETION

  api.register('events.delete',
    commonFns.getParamsValidation(methodsSchema.del.params),
    function (context, params, result, next) {
      checkEventForDelete(context, params.id, function (err, event) {
        if (err) {
          return next(err);
        }

        context.event = event;
        if (!event.trashed) {
          // move to trash
          flagAsTrashed(context, params, result, next);
        } else {
          // actually delete
          deleteWithData(context, params, result, next);
        }
      });
    }, notify);

  /**
   * If event belongs to the account stream - 
   * 1) deal with properties that enforces uniqueness
   * 2) send to service-register if needed
   * 
   * !!! this function checks for the unique value and not a stream id
   * @param object user {id: '', username: ''}
   * @param object event
   * @param string id 
   */
  async function handleUniqueFields (user, event, id) {
    let updatedEvent;
    // if needed remove field that enforces uniqueness
    const existingUniqueProperty = Object.keys(event)
      .find(function (item) { return item.includes('__unique') });

    if (typeof existingUniqueProperty === 'string' && existingUniqueProperty.length > 0) {
      updatedEvent = await bluebird.fromCallback(cb =>
        userEventsStorage.updateOne(user, { _id: id },
          { [existingUniqueProperty]: cuid() }, cb));

      if (getConfig().get('singleNode:isActive') !== true) {
        // initialize service-register connection
        const serviceRegisterConn = new ServiceRegister(servicesSettings.register, logging.getLogger('service-register'));
      
        // send information update to service regsiter
        await serviceRegisterConn.updateUserInServiceRegister(
          user.username, {}, { [existingUniqueProperty.split('__unique')[0]]: event[existingUniqueProperty]});
      }
    }
    return updatedEvent;
  }
  
  async function flagAsTrashed(context, params, result, next) {
    var updatedData = {
      trashed: true
    };
    context.updateTrackingProperties(updatedData);
    try {
      let updatedEvent = await handleUniqueFields(context.user, context.event, params.id);

      updatedEvent = await bluebird.fromCallback(cb =>
        userEventsStorage.updateOne(context.user, { _id: params.id }, updatedData, cb));

      // if update was not done and no errors were catched
      //, perhaps user is trying to edit account streams
      if (!updatedEvent) {
        return next(errors.DeniedEventModification());
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

  function deleteWithData(context, params, result, next) {
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
        context.user.storageUsed.attachedFiles -= getTotalAttachmentsSize(context.event);
        await userRepository.updateOne(context.user.id, context.user.storageUsed);
      }
    ], next);
  }

  function getTotalAttachmentsSize(event) {
    if (! event.attachments) {
      return 0;
    }
    return _.reduce(event.attachments, function (evtTotal, att) {
      return evtTotal + att.size;
    }, 0);
  }

  api.register('events.deleteAttachment',
    commonFns.getParamsValidation(methodsSchema.deleteAttachment.params),
    async function (context, params, result, next) {
      var updatedEvent,
        deletedAtt;
      
      try {
        updatedEvent = await bluebird.fromCallback(cb =>
          checkEventForDelete(context, params.id, cb));

        var attIndex = getAttachmentIndex(updatedEvent.attachments, params.fileId);
        if (attIndex === -1) {
          return next(errors.unknownResource(
            'attachment', params.fileId
          ));
        }
        deletedAtt = updatedEvent.attachments[attIndex];
        updatedEvent.attachments.splice(attIndex, 1);

        var updatedData = { attachments: updatedEvent.attachments };
        context.updateTrackingProperties(updatedData);

        let alreadyUpdatedEvent = await bluebird.fromCallback(cb =>
          userEventsStorage.updateOne(context.user, { _id: params.id }, updatedData, cb));

        // if update was not done and no errors were catched
        //, perhaps user is trying to edit account streams
        if (!alreadyUpdatedEvent) {
          return next(errors.DeniedEventModification());
        }

        // To remove when streamId not necessary
        alreadyUpdatedEvent.streamId = alreadyUpdatedEvent.streamIds[0];

        result.event = alreadyUpdatedEvent;
        setFileReadToken(context.access, result.event);

        await bluebird.fromCallback(cb => userEventFilesStorage.removeAttachedFile(context.user, params.id, params.fileId, cb));

        // approximately update account storage size
        context.user.storageUsed.attachedFiles -= deletedAtt.size;
        await userRepository.updateOne(context.user.id, context.user.storageUsed);
        notifications.eventsChanged(context.user);
        next();
      } catch (err) {
        next(err);
      }
    });

  /**
   * Returns the query value to use for the given type, handling possible wildcards.
   *
   * @param {String} requestedType
   */
  function getTypeQueryValue(requestedType) {
    var wildcardIndex = requestedType.indexOf('/*');
    return wildcardIndex > 0 ?
      new RegExp('^' + requestedType.substr(0, wildcardIndex + 1)) : 
      requestedType;
  }

  async function checkEventForDelete (context, eventId, callback) {
    userEventsStorage.findOne(context.user, { id: eventId }, null, function (err, event) {
      if (err) {
        return callback(errors.unexpectedError(err));
      }
      if (! event) {
        return callback(errors.unknownResource(
          'event', eventId
        ));
      }
      
      let canDeleteEvent = false;

      for (let i = 0; i < event.streamIds.length; i++) {
        if (context.canUpdateContext(event.streamIds[i], event.tags)) {
          canDeleteEvent = true;
          break;
        }
      }
      if (! canDeleteEvent) return callback(errors.forbidden());

      // check if event belongs to account streams and if it is allowed to delete it
      const allowedToDelete = handleAccountStreamsDeletion(event);
      if (!allowedToDelete) return callback(errors.DeniedEventModification('streamId'));

      callback(null, event);
    });
  }

  /**
 * Remove events that belongs to the account streams and should not be allowed for editing
 * @param query - mongo query object 
 */
  function handleAccountStreamsDeletion (event): Boolean {
    let allowedToDelete = true;
    let forbidenUserAccountStreams = SystemStreamsSerializer.getAccountStreamsIdsForbiddenForEditing();
    const editableAccountStreams = Object.keys(SystemStreamsSerializer.getEditableAccountStreams());
    if (event?.streamIds) {
      if (_.intersection(event.streamIds, forbidenUserAccountStreams).length > 0) {
        allowedToDelete = false;
      } else if (_.intersection(event.streamIds, editableAccountStreams).length > 0
        && event.streamIds.includes(SystemStreamsSerializer.options.STREAM_ID_ACTIVE)) {
        allowedToDelete = false;
      }
    }
    return allowedToDelete;
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
  function setFileReadToken(access, event) {
    if (! event.attachments) { return; }
    event.attachments.forEach(function (att) {
      att.readToken = utils.encryption
        .fileReadToken(att.id, 
          access.id, access.token,
          authSettings.filesReadTokenSecret);
    });
  }

};

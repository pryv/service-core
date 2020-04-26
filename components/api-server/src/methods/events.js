
var utils = require('components/utils'),
    errors = require('components/errors').factory,
    async = require('async'),
    commonFns = require('./helpers/commonFunctions'),
    methodsSchema = require('../schema/eventsMethods'),
    eventSchema = require('../schema/event'),
    querying = require('./helpers/querying'),
    timestamp = require('unix-timestamp'),
    treeUtils = utils.treeUtils,
    _ = require('lodash'),
    SetFileReadTokenStream = require('./streams/SetFileReadTokenStream'),
    FilterReadableStreamIdsStream = require('./streams/FilterReadableStreamIdsStream');
    
const assert = require('assert');
    
const {TypeRepository, isSeriesType} = require('components/business').types;

const NatsPublisher = require('../socket-io/nats_publisher');
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
  api, userEventsStorage, userEventFilesStorage, usersStorage,
  authSettings, eventTypesUrl, notifications, logging,
  auditSettings, updatesSettings,
) {

  // Update types and log error
  typeRepo.tryUpdate(eventTypesUrl)
    .catch((err) => logging.getLogger('typeRepo').warn(err));
    
  const logger = logging.getLogger('methods/events');
  const natsPublisher = new NatsPublisher(NATS_CONNECTION_URI);

  // RETRIEVAL

  api.register('events.get',
    commonFns.getParamsValidation(methodsSchema.get.params),
    applyDefaultsForRetrieval,
    findAccessibleEvents,
    includeDeletionsIfRequested);

  function applyDefaultsForRetrieval(context, params, result, next) {
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
    }

    if (! context.access.canReadAllTags()) {
      var accessibleTags = Object.keys(context.access.tagPermissionsMap);
      params.tags = params.tags 
        ? _.intersection(params.tags, accessibleTags) 
        : accessibleTags;
    }

    next();
  }

  function findAccessibleEvents(context, params, result, next) {
    // build query
    var query = querying.noDeletions(querying.applyState({}, params.state));
    if (params.streams) {
      query.streamIds = {$in: params.streams};
    }
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
        .pipe(new FilterReadableStreamIdsStream(
          {
            streams: params.streams,
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

  function findEvent(context, params, result, next) {
    userEventsStorage.findOne(context.user, {id: params.id}, null, function (err, event) {
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

      event.streamIds = filterReadableStreamIds(context, event.streamIds);
      // same for streamId if first one is non readable
      event.streamId = event.streamIds[0];

      setFileReadToken(context.access, event);
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
    checkExistingLaterPeriodIfNeeded,
    checkOverlappedPeriodsIfNeeded,
    verifycanContributeToContext,
    stopPreviousPeriodIfNeeded,
    createEvent,
    createAttachments,
    notify);

  /**
   * Shorthand for `create` with `null` event duration.
   */
  api.register('events.start',
    returnGoneError);

  function returnGoneError(context, params, result, next) {
    return next(errors.goneResource());
  }

  function setDurationForStart(context, params, result, next) {
    params.duration = null;
    next();
  }

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

  function verifycanContributeToContext(context, params, result, next) {
    for (let i = 0; i < context.content.streamIds.length; i++) { // refuse if any context is not accessible
      if (! context.canContributeToContext(context.content.streamIds[i], context.content.tags)) {
        return next(errors.forbidden());
      }
    }
    next();
  }

  function createEvent(
    context, params, result, next) 
  {

    if (isSeriesType(context.content.type)) {
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

        result.event = newEvent;
        next();
      });
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

  function createAttachments(context, params, result, next) {
    attachFiles(context, {id: result.event.id}, context.files, function (err, attachments) {
      if (err) {
        return next(err); }
      if (! attachments) {
        return next();
      }

      result.event.attachments = attachments;
      userEventsStorage.updateOne(context.user, {id: result.event.id}, {attachments: attachments},
        function (err) {
          if (err) {
            return next(errors.unexpectedError(err));
          }

          setFileReadToken(context.access, result.event);
          next();
        });
    });
  }

  // -------------------------------------------------------------------- UPDATE


  api.register('events.update',
    commonFns.getParamsValidation(methodsSchema.update.params),
    commonFns.catchForbiddenUpdate(eventSchema('update'), updatesSettings.ignoreProtectedFields, logger),
    normalizeStreamIdAndStreamIds,
    applyPrerequisitesForUpdate,
    validateEventContentAndCoerce,
    checkExistingLaterPeriodIfNeeded,
    checkOverlappedPeriodsIfNeeded,
    stopPreviousPeriodIfNeeded,
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

      // in the context of migration delete streamId that was added by findOne
      delete event.streamId;

      /**
       * 1. check that have contributeContext on at least 1 existing streamId
       * 2. check that streams we add have contribute access
       * 3. check that streams we remove have contribute access
       */

      // 1. check that have contributeContext on at least 1 existing streamId
      let canUpdateEvent = false;
      for (let i = 0; i < event.streamIds.length ; i++) {
        if (context.canUpdateContext(event.streamIds[i], event.tags)) {
          canUpdateEvent = true;
          break;
        }
      }
      if (! canUpdateEvent) return next(errors.forbidden());
      
      if (eventUpdate.streamIds != null) {

        // 2. check that streams we add have contribute access
        const streamIdsToAdd = _.difference(eventUpdate.streamIds, event.streamIds);
        for (let i=0; i<streamIdsToAdd.length; i++) {
          if (! context.canUpdateContext(streamIdsToAdd[i], event.tags)) {
            return next(errors.forbidden());
          }
        }

        // 3. check that streams we remove have contribute access
        // check that unauthorized streams are untouched by adding them back
        
        /**
         * 1. compute streamIds to remove
         *  a. event.streamIds - eventUpdate.streamIds + event.hiddenStreams
         */
        for (let i = 0; i < event.streamIds.length ; i++) {
          if (! context.canReadStream(event.streamIds[i])) eventUpdate.streamIds.push(event.streamIds[i]);
        }
        const streamIdsToRemove = _.difference(event.streamIds, eventUpdate.streamIds);

        for (let i = 0; i < streamIdsToRemove.length ; i++) {
          if (! context.canUpdateContext(streamIdsToRemove[i], event.tags)) {
            return next(errors.forbidden());
          }
        }
      } 

      

      // -- Change this 

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
    });

  }

  function generateLogIfNeeded(context, params, result, next) {
    if (!auditSettings.forceKeepHistory) {
      return next();
    }

    context.oldContent = _.extend(context.oldContent, {headId: context.content.id});
    delete context.oldContent.id;

    userEventsStorage.insertOne(context.user, context.oldContent, function (err) {
      if (err) {
        return next(errors.unexpectedError(err));
      }
      delete context.oldContent;
      next();
    });
  }

  function updateAttachments(context, params, result, next) {
    var eventInfo = {
      id: context.content.id,
      attachments: context.content.attachments || []
    };
    attachFiles(context, eventInfo, sanitizeRequestFiles(params.files),
      function (err, attachments) {
        if (err) { return next(err); }

        if (attachments) {
          context.content.attachments = attachments;
        }
        next();
      });
  }

  function updateEvent (context, params, result, next) {
    userEventsStorage.updateOne(context.user, {id: context.content.id}, context.content,
      function (err, updatedEvent) {
        if (err) {
          return next(errors.unexpectedError(err));
        }
        updatedEvent.streamIds = filterReadableStreamIds(context, updatedEvent.streamIds);
        // same for streamId if first one is non readable
        updatedEvent.streamId = updatedEvent.streamIds[0];
        result.event = updatedEvent;
        setFileReadToken(context.access, result.event);
        next();
      });
  }

  function notify(context, params, result, next) {
    notifications.eventsChanged(context.user);

    // notify is called by create, update and delete
    // depending on the case the event properties will be found in context or event
    if (isSeriesEvent(context.event || result.event)) {
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
    const event = context.content;

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
    if (event.streamIds.length > 1) {
      event.streamIds = [...new Set(event.streamIds)];
    }
    delete event.streamId;
    context.content = event;
    
    context.setStreamList(event.streamIds);
    if (! checkStreams(context, next)) {
      return;
    }
    // assert `streamIds` is set and duplicate-free
  
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
  function checkStreams(context, errorCallback) {

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

  function isConcernedBySingleActivity(context) {
    if (! context.streamList) return false;
    for (let i = 0; i < context.streamList.length; i++) {
      if (context.streamList[i].singleActivityRootId) {
        return true;
      }
    }
    return false;
  }

  function checkExistingLaterPeriodIfNeeded(context, params, result, next) {
    if (! context.content.hasOwnProperty('time')) {
      return next();
    }

    if (!isPeriod(context.content) ||
      !isRunning(context.content)) {
      // marks and *finished* periods can be inserted before an existing period
      return process.nextTick(next);
    }

    if (! isConcernedBySingleActivity(context)) {
      return process.nextTick(next);
    }

    // forbid multiple stream events in single activity mode
    if (context.content.streamIds.length > 1) {
      return next(errors.invalidOperation('Events with multiple streamIds cannot use the single activity feature'));
    }

    var query = {
      streamIds: {$in: context.getSingleActivityExpandedIds()},
      time: {'$gt': context.content.time},
      $and: [
        {duration: {'$exists' : true}},
        {duration: {$ne: 0}}
      ]
    };
    var options = {
      projection: {id: 1},
      sort: {time: 1}
    };
    userEventsStorage.findOne(context.user, query, options, function (err, periodEvent) {
      if (err) { return next(errors.unexpectedError(err)); }

      if (periodEvent) {
        return next(errors.invalidOperation('At least one period event ("' + periodEvent.id +
          '") already exists at a later time', {conflictingEventId: periodEvent.id}
        ));
      }

      next();
    });
  }

  /**
   * Considers running events to have no duration.
   *
   * @param {Object} context
   * @param {Object} params
   * @param {Object} result
   * @param {Function} next
   */
  function checkOverlappedPeriodsIfNeeded(context, params, result, next) {
    if (! context.content.hasOwnProperty('time') && ! context.content.hasOwnProperty('duration')) {
      return next();
    }
    if (! isPeriod(context.content) ||
        isRunning(context.content)) {
      // marks (can be duration of zero) and *running* periods cannot overlap
      return process.nextTick(next);
    }

    if (!isConcernedBySingleActivity(context)) {
      return process.nextTick(next);
    }


    // forbid multiple stream events in single activity mode
    
    if (context.content.streamIds.length > 1) {
      return next(errors.invalidOperation('Events with multiple streamIds cannot use the single activity feature'));
    }
    

    var endTime = context.content.time + context.content.duration;
    var query = {
      streamIds: {$in: context.getSingleActivityExpandedIds()},
      $and: [
        {duration: {'$exists' : true}},
        {duration: {$ne: 0}}
      ],
      $or: [
        // earlier periods
        {
          time: {$lt: context.content.time},
          endTime: { $gt: context.content.time, $lte: timestamp.now() }
        },
        // later periods
        {time: { $gte: context.content.time, $lt: endTime }}
      ]
    };
    var options = {
      projection: {id: 1},
      sort: {time: 1}
    };
    userEventsStorage.find(context.user, query, options, function (err, periodEvents) {
      if (err) {
        return next(errors.unexpectedError(err));
      }

      if (context.content.id) {
        // ignore self
        periodEvents = periodEvents.filter(function (e) {
          return e.id !== context.content.id;
        });
      }

      if (periodEvents.length > 0) {
        var msg = 'The event\'s period overlaps existing period events.';
        return next(errors.periodsOverlap(msg,
          {overlappedIds: periodEvents.map(function (e) { return e.id; })}
        ));
      }

      next();
    });
  }

  function stopPreviousPeriodIfNeeded(context, params, result, next) {

    if (! isConcernedBySingleActivity(context) ||
        ! isPeriod(context.content)) {
      // marks do not affect periods
      return process.nextTick(next);
    }


    // forbid multiple stream events in single activity mode
    if (context.content.streamIds.length > 1) {
      return next(errors.invalidOperation('Events with multiple streamIds cannot use the single activity feature'));
    }

    var stopParams = {
      singleActivity: true,
      time: context.content.time
    };
    findLastRunning(context, stopParams, function (err, eventToStop) {
      if (err) { return next(errors.unexpectedError(err)); }
      stopEvent(context, eventToStop, context.content.time, function (err, stoppedId) {
        if (err) { return next(err); }

        if (stoppedId) {
          result.stoppedId = stoppedId;
        }

        next();
      });
    });
  }

  /**
   * @param {Object} params Must have `singleActivity`, `time` (and optionally `type`)
   */
  function findLastRunning(context, params, callback) {
    
    const streamIds = context.streamList.map(function(stream) { return stream.id; });
    var query = {
      streamIds: params.singleActivity 
        ? { $in: context.getSingleActivityExpandedIds()} 
        : { $in: streamIds },
      time: {'$lt': params.time},
      duration: {'$type' : 10} // matches when duration exists and is null
    };
    if (params.type) {
      query.type = getTypeQueryValue(params.type);
    }
    userEventsStorage.findOne(context.user, query, {sort: {time: -1}}, callback);
  }

  /**
   * Saves the uploaded files (if any) as attachments, returning the corresponding attachments info.
   *
   * @param {Object} context
   * @param {Object} eventInfo Expected properties: id, attachments
   * @param files Express-style uploaded files object (as in req.files)
   * @param {Function} callback (error, attachments)
   */
  function attachFiles(context, eventInfo, files, callback) {
    if (! files) { return process.nextTick(callback); }

    var attachments = eventInfo.attachments ? eventInfo.attachments.slice() : [],
        sizeDelta = 0;

    async.forEachSeries(Object.keys(files), saveFile, function (err) {
      if (err) {
        // TODO: remove saved files if any
        return callback(err);
      }
      // approximately update account storage size
      context.user.storageUsed.attachedFiles += sizeDelta;
      usersStorage.updateOne({id: context.user.id}, {storageUsed: context.user.storageUsed},
        function (err) {
          if (err) { return callback(errors.unexpectedError(err)); }
          callback(null, attachments);
        });
    });

    function saveFile(name, done) {
      var fileInfo = files[name];
      userEventFilesStorage.saveAttachedFile(fileInfo.path, context.user, eventInfo.id, /*fileId,*/
        function (err, fileId) {
          if (err) { return done(errors.unexpectedError(err)); }

          attachments.push({
            id: fileId,
            fileName: fileInfo.originalname,
            type: fileInfo.mimetype,
            size: fileInfo.size
          });
          sizeDelta += fileInfo.size;
          done();
        });
    }
  }

  api.register('events.stop',
    returnGoneError,
    commonFns.getParamsValidation(methodsSchema.stop.params),
    function (context, params, result, next) {
      // default time is now
      _.defaults(params, { time: timestamp.now() });

      if (params.id) {
        userEventsStorage.findOne(context.user, {id: params.id}, null, function (err, event) {
          if (err) { return next(errors.unexpectedError(err)); }
          if (! event) {
            return next(errors.unknownReferencedResource(
              'event', 'id', params.id
            ));
          }
          if (! isRunning(event)) {
            return next(errors.invalidOperation(
              'Event "' + params.id + '" is not a running period event.'
            ));
          }
          if (event.streamIds.length > 1) {
            return next(errors.invalidOperation(
              'Cannot stop Event "' + params.id + '" which is in multiple streams.'
            ));
          }
          applyStop(null, event);
        });
      } else if (params.streamId) { // legacy streamId paramter DO NOT CONVERT TO streamIds
        context.setStreamList([params.streamId]);
        if (! context.streamList[0].singleActivityRootId && ! params.type) {
          return process.nextTick(next.bind(null, 
            errors.invalidParametersFormat(
              'You must specify the event `id` or `type` ' +
              ' (not a "single activity" stream).'
            )
          ));
        }
        if (! checkStreams(context, next)) { return; }
        var stopParams = {
          singleActivity: !! context.streamList[0].singleActivityRootId,
          time: params.time,
          type: params.type
        };
        findLastRunning(context, stopParams, applyStop);
      } else {
        process.nextTick(next.bind(null,
          errors.invalidParametersFormat(
            'You must specify either the "single activity " stream id '+
            'or the event `id`.'
          )
        ));
      }

      function applyStop(error, event) {
        if (error) { return next(errors.unexpectedError(error)); }

        stopEvent(context, event, params.time, function (err, stoppedId) {
          if (err) { return next(err); }

          result.stoppedId = stoppedId;
          notifications.eventsChanged(context.user);
          next();
        });
      }
    });

  /**
   * Enforces permissions (returns an error if forbidden).
   * Returns null if no running period event was found.
   *
   * @param {Object} context
   * @param {Object} event
   * @param {Number} stopTime
   * @param {Function} callback ({APIError} error, {String|null} stoppedId)
   */
  function stopEvent(context, event, stopTime, callback) {
    if (! event) { return process.nextTick(callback); }
 
    let ok = false; // ok if at least one stream is in contribute
    for (let i = 0; i < event.streamIds.length; i++) {
      if (context.canContributeToContext(event.streamId[i], event.tags)) {
        ok = true;
        break;
      }
    }
    if (! ok) {
      return process.nextTick(callback.bind(null, errors.forbidden()));
    }

    async.series([
      function generateLogIfNeeded(stepDone) {
        if (!auditSettings.forceKeepHistory) {
          return stepDone();
        }
        var oldEvent = _.cloneDeep(event);
        oldEvent = _.extend(oldEvent, {headId: oldEvent.id});
        delete oldEvent.id;

        userEventsStorage.insertOne(context.user, oldEvent, function (err) {
          if (err) {
            return stepDone(errors.unexpectedError(err));
          }
          stepDone();
        });
      },
      function stopEvent(stepDone) {
        var updatedData = {
          // always include time: needed by userEventsStorage to update the DB-only "endTime" field
          time: event.time,
          duration: stopTime - event.time
        };

        context.updateTrackingProperties(updatedData);

        userEventsStorage.updateOne(context.user, {id: event.id}, updatedData, function (err) {
          if (err) {
            return callback(errors.unexpectedError(err));
          }
          stepDone(null, event.id);
        });
      }
    ], function(err, res) {
      callback(err, res[1]);
    });
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

  function flagAsTrashed(context, params, result, next) {
    var updatedData = {trashed: true};
    context.updateTrackingProperties(updatedData);

    userEventsStorage.updateOne(context.user, {id: params.id}, updatedData,
      function (err, updatedEvent) {
        if (err) { return next(errors.unexpectedError(err)); }

        updatedEvent.streamIds = filterReadableStreamIds(context, updatedEvent.streamIds);
        // same for streamId if first one is non readable
        updatedEvent.streamId = updatedEvent.streamIds[0];
        result.event = updatedEvent;
        setFileReadToken(context.access, result.event);

        next();
      });
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
      function (stepDone) {
        // If needed, approximately update account storage size
        if (! context.user.storageUsed || ! context.user.storageUsed.attachedFiles) {
          return stepDone();
        }
        context.user.storageUsed.attachedFiles -= getTotalAttachmentsSize(context.event);
        usersStorage.updateOne({id: context.user.id}, {storageUsed: context.user.storageUsed},
          stepDone);

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
    function (context, params, result, next) {
      var updatedEvent,
          deletedAtt;
      async.series([
        function (stepDone) {
          checkEventForDelete(context, params.id, function (err, event) {
            if (err) { return stepDone(err); }

            updatedEvent = event;
            stepDone();
          });
        },
        function (stepDone) {
          var attIndex = getAttachmentIndex(updatedEvent.attachments, params.fileId);
          if (attIndex === -1) {
            return stepDone(errors.unknownResource(
              'attachment', params.fileId
            ));
          }
          deletedAtt = updatedEvent.attachments[attIndex];
          updatedEvent.attachments.splice(attIndex, 1);

          var updatedData = {attachments: updatedEvent.attachments};
          context.updateTrackingProperties(updatedData);

          userEventsStorage.updateOne(context.user, {id: params.id}, updatedData,
            function (err, updatedEvent) {
              if (err) { return stepDone(err); }
              result.event = updatedEvent;
              setFileReadToken(context.access, result.event);
              stepDone();
            });
        },
        function (stepDone) {
          userEventFilesStorage.removeAttachedFile(context.user, params.id, params.fileId, stepDone);
        },
        function (stepDone) {
          // approximately update account storage size
          context.user.storageUsed.attachedFiles -= deletedAtt.size;
          usersStorage.updateOne({id: context.user.id}, {storageUsed: context.user.storageUsed},
            stepDone);
        },
        function (stepDone) {
          notifications.eventsChanged(context.user);
          stepDone();
        }
      ], next);
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

  function checkEventForDelete(context, eventId, callback) {
    userEventsStorage.findOne(context.user, {id: eventId}, null, function (err, event) {
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

      callback(null, event);
    });
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

  function isPeriod(event) {
    return event.hasOwnProperty('duration') &&
        (event.duration === null || event.duration !== 0);
  }

  function isRunning(event) {
    return event.duration === null;
  }

  function filterReadableStreamIds(context, eventStreamIds) {
    const accessibleStreamIds = [];
    eventStreamIds.forEach(s => {
      if (context.canReadStream(s)) accessibleStreamIds.push(s);
    });
    return accessibleStreamIds;
  }

};
module.exports.injectDependencies = true;

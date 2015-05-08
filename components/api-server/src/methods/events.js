var utils = require('components/utils'),
    errors = require('components/errors').factory,
    async = require('async'),
    commonFns = require('./helpers/commonFunctions'),
    methodsSchema = require('../schema/eventsMethods'),
    querying = require('./helpers/querying'),
    timestamp = require('unix-timestamp'),
    treeUtils = utils.treeUtils,
    validation = require('../schema/validation'),
    _ = require('lodash');

/**
 * Events API methods implementations.
 * TODO: refactor methods as chains of functions
 *
 * @param api
 * @param userEventsStorage
 * @param userEventFilesStorage
 * @param usersStorage
 * @param authSettings
 * @param eventTypes
 * @param notifications
 */
module.exports = function (api, userEventsStorage, userEventFilesStorage, usersStorage,
                           authSettings, eventTypes, notifications) {

  // COMMON

  api.register('events.*',
      commonFns.loadAccess);

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
    if (params.fromTime === null && params.toTime !== null) {
      params.fromTime = timestamp.add(params.toTime, -24 * 60 * 60);
    }
    if (params.fromTime !== null && params.toTime === null) {
      params.toTime = timestamp.now();
    }
    if (params.fromTime === null && params.toTime === null && params.limit === null) {
      // limit to 20 items by default
      params.limit = 20;
    }

    if (params.streams !== null) {
      var expandedStreamIds = treeUtils.expandIds(context.streams, params.streams);
      var unknownIds = _.difference(params.streams, expandedStreamIds);

      if (unknownIds.length > 0) {
        return next(errors.unknownReferencedResource('stream' + (unknownIds.length > 1 ? 's' : ''),
            'streams', unknownIds));
      }

      params.streams = expandedStreamIds;
    }
    if (params.state === 'default') {
      // exclude events in trashed streams
      var nonTrashedStreamIds = treeUtils.collectPluck(treeUtils.filterTree(context.streams, false,
          function (s) { return ! s.trashed; }), 'id');
      params.streams = params.streams ?
          _.intersection(params.streams, nonTrashedStreamIds) : nonTrashedStreamIds;
    }
    if (! context.access.canReadAllStreams()) {
      var accessibleStreamIds = Object.keys(context.access.streamPermissionsMap);
      params.streams = params.streams ?
          _.intersection(params.streams, accessibleStreamIds) : accessibleStreamIds;
    }

    if (! context.access.canReadAllTags()) {
      var accessibleTags = Object.keys(context.access.tagPermissionsMap);
      params.tags = params.tags ?
          _.intersection(params.tags, accessibleTags) : accessibleTags;
    }

    next();
  }

  function findAccessibleEvents(context, params, result, next) {
    // build query
    var query = querying.noDeletions(querying.applyState({}, params.state));
    if (params.streams) {
      query.streamId = {$in: params.streams};
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
    if (params.fromTime) {
      query.$or = [
        {
          time: {$lt: params.fromTime},
          endTime: {$gte: params.fromTime}
        },
        {time: { $gte: params.fromTime, $lte: params.toTime }}
      ];
    }
    if (params.toTime) {
      _.defaults(query, {time: {}});
      query.time.$lte = params.toTime;
    }
    if (params.modifiedSince) {
      query.modified = {$gt: params.modifiedSince};
    }

    var options = {
      fields: params.returnOnlyIds ? {id: 1} : {},
      sort: { time: params.sortAscending ? 1 : -1 },
      skip: params.skip,
      limit: params.limit
    };

    userEventsStorage.find(context.user, query, options, function (err, events) {
      if (err) {
        return next(errors.unexpectedError(err));
      }

      events.forEach(setFileReadToken.bind(null, context.access));
      result.events = events;
      next();
    });
  }

  function includeDeletionsIfRequested(context, params, result, next) {
    if (! params.modifiedSince || ! params.includeDeletions) { return next(); }

    var options = {
      sort: { deleted: params.sortAscending ? 1 : -1 },
      skip: params.skip,
      limit: params.limit
    };

    userEventsStorage.findDeletions(context.user, params.modifiedSince, options,
        function (err, deletions) {
      if (err) { return next(errors.unexpectedError(err)); }

      result.eventDeletions = deletions;
      next();
    });
  }

  // CREATION

  api.register('events.create',
    commonFns.getParamsValidation(methodsSchema.create.params),
    cleanupInputAndCheckStream,
    validateEventContentToReplace,
    checkExistingLaterPeriodIfNeededToReplace,
    checkOverlappedPeriodsIfNeeded,
    verifyContext,
    stopPreviousPeriodIfNeeded,
    createEventLiterally,
    saveAttachments,
    notify);

  /**
   * Shorthand for `create` with `null` event duration.
   */
  api.register('events.start',
    setDurationForStart,
    commonFns.getParamsValidation(methodsSchema.create.params),
    cleanupInputAndCheckStream,
    validateEventContentToReplace,
    checkExistingLaterPeriodIfNeededToReplace,
    checkOverlappedPeriodsIfNeeded,
    verifyContext,
    stopPreviousPeriodIfNeeded,
    createEventLiterally,
    saveAttachments,
    notify);

  function setDurationForStart(context, params, result, next) {
    params.duration = null;
    next();
  }

  function cleanupInputAndCheckStream(context, params, result, next) {
    // default time is now
    _.defaults(params, { time: timestamp.now() });
    if (! params.tags) {
      params.tags = [];
    }
    cleanupEventTags(params);

    var files = sanitizeRequestFiles(params.files);
    context.files = files;
    delete params.files;

    utils.tracking.initProperties(context.access.id, params);

    context.setStream(params.streamId);
    if (! checkStream(context, params.streamId, next)) {
      return;
    }
    //console.log('beforeAsync finished');
    next();
  }

  function validateEventContentToReplace(context, params, result, next) {
    validateEventContent(params, next);
  }

  function checkExistingLaterPeriodIfNeededToReplace(context, params, result, next) {
    checkExistingLaterPeriodIfNeeded(context, params, next);
  }

  function verifyContext(context, params, result, next) {
    if (! context.canContributeToContext(params.streamId, params.tags)) {
      return next(errors.forbidden());
    }
    next();
  }

  function createEventLiterally(context, params, result, next) {
    userEventsStorage.insertOne(context.user, params, function (err, newEvent) {
      if (err) {
        return next(errors.unexpectedError(err));
      }

      result.event = newEvent;
      next();
    });
  }

  function saveAttachments(context, params, result, next) {
    attachFiles(context, {id: result.event.id}, context.files, function (err, attachments) {
      if (err) {
        return next(err); }
      if (! attachments) {
        return next();
      }

      result.event.attachments = attachments;
      userEventsStorage.update(context.user, {id: result.event.id}, {attachments: attachments},
        function (err) {
          if (err) {
            return next(errors.unexpectedError(err));
          }

          setFileReadToken(context.access, result.event);
          next();
        });
    });
  }

  function notify(context, params, result, next) {
    notifications.eventsChanged(context.user);
    next();
  }
  
  // UPDATE

  api.register('events.update',
      commonFns.getParamsValidation(methodsSchema.update.params),
      function (context, params, result, next) {
    cleanupEventTags(params.update);

    // strip ignored properties if there (read-only)
    delete params.update.id;
    delete params.update.attachments;

    utils.tracking.updateProperties(context.access.id, params.update);

    var updatedEvent = null;

    async.series([
      function checkExistingEvent(stepDone) {
        userEventsStorage.findOne(context.user, {id: params.id}, null, function (err, event) {
          if (err) {
            return stepDone(errors.unexpectedError(err));
          }

          if (! event) {
            return stepDone(errors.unknownResource('event', params.id));
          }

          if (! context.canContributeToContext(event.streamId, event.tags)) {
            return stepDone(errors.forbidden());
          }

          updatedEvent = _.extend(event, params.update);

          context.setStream(updatedEvent.streamId);
          if (params.update.streamId && ! checkStream(context, updatedEvent.streamId, stepDone)) {
            return;
          }

          stepDone();
        });
      },
      function validateContent(stepDone) {
        validateEventContent(updatedEvent, function (err) {
          if (err) {
            return stepDone(errors.invalidParametersFormat('The event content\'s format is ' +
                'invalid.', err));
          }
          stepDone();
        });
      },
      function (stepDone) {
        if (! params.update.hasOwnProperty('time')) {
          // always include time: needed by userEventsStorage to update the DB-only "endTime" field
          params.update.time = updatedEvent.time;
          return stepDone();
        }
        checkExistingLaterPeriodIfNeeded(context, updatedEvent, stepDone);
      },
      function (stepDone) {
        if (! params.update.hasOwnProperty('time') && ! params.update.hasOwnProperty('duration')) {
          return stepDone();
        }
        checkOverlappedPeriodsIfNeeded(context, updatedEvent, result, stepDone);
      },
      function (stepDone) {
        stopPreviousPeriodIfNeeded(context, updatedEvent, result, stepDone);
      },
      function (stepDone) {
        var eventInfo = {
          id: params.id,
          attachments: updatedEvent.attachments || []
        };
        attachFiles(context, eventInfo, sanitizeRequestFiles(params.files),
            function (err, attachments) {
          if (err) { return stepDone(err); }

          if (attachments) {
            params.update.attachments = attachments;
          }
          stepDone();
        });
      },
      function update(stepDone) {
        userEventsStorage.update(context.user, {id: params.id}, params.update,
            function (err, updatedEvent) {
          if (err) {
            return stepDone(errors.unexpectedError(err));
          }

          result.event = updatedEvent;
          setFileReadToken(context.access, result.event);
          notifications.eventsChanged(context.user);
          stepDone();
        });
      }
    ], next);
  });

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

  /**
   * Validates the event's content against its type (if known).
   * Will try casting string content to number if appropriate.
   *
   * @param {Object} eventData
   * @param {Function} callback
   */
  function validateEventContent(eventData, callback) {
    var knownType = eventTypes.types[eventData.type];
    if (knownType) {
      validation.validate(eventData.hasOwnProperty('content') ? eventData.content : null, knownType,
          function (err) {
        if (err && knownType.type === 'number' && typeof eventData.content === 'string') {
          var castedToNum = +eventData.content;
          if (! isNaN(castedToNum)) {
            eventData.content = castedToNum;
            return validation.validate(eventData.content, knownType, callback);
          }
        }
        callback(err || null);
      });
    } else {
      callback(null);
    }
  }

  function cleanupEventTags(eventData) {
    if (! eventData.tags) { return; }
    eventData.tags = eventData.tags.map(function (tag) { return tag.trim(); })
        .filter(function (tag) { return tag.length > 0; });
  }

  /**
   * Checks that the context's stream exists and isn't trashed.
   * `context.setStream` must be called beforehand.
   *
   * @param {Object} context
   * @param {String} streamId
   * @param {Function} errorCallback Called with the appropriate error if any
   * @return `true` if OK, `false` if an error was found.
   */
  function checkStream(context, streamId, errorCallback) {
    if (! context.stream) {
      errorCallback(errors.unknownReferencedResource('stream', 'streamId', streamId));
      return false;
    }
    if (context.stream.trashed) {
      errorCallback(errors.invalidOperation('The referenced stream "' + streamId +
          '" is trashed.', {trashedReference: 'streamId'}));
      return false;
    }
    return true;
  }

  function checkExistingLaterPeriodIfNeeded(context, event, callback) {
    if (! context.stream.singleActivityRootId ||
        ! isPeriod(event) ||
        ! isRunning(event)) {
      // marks and *finished* periods can be inserted before an existing period
      return process.nextTick(callback);
    }

    var query = {
      streamId: {$in: context.getSingleActivityExpandedIds()},
      time: {'$gt': event.time},
      $and: [
        {duration: {'$exists' : true}},
        {duration: {$ne: 0}}
      ]
    };
    var options = {
      fields: {id: 1},
      sort: {time: 1}
    };
    userEventsStorage.findOne(context.user, query, options, function (err, periodEvent) {
      if (err) { return callback(errors.unexpectedError(err)); }

      if (periodEvent) {
        return callback(errors.invalidOperation('At least one period event ("' + periodEvent.id +
            '") already exists at a later time', {conflictingEventId: periodEvent.id}));
      }

      callback();
    });
  }

  /**
   * Considers running events to have no duration.
   *
   * @param {Object} context
   * @param {Object} params
   * @param {Function} next
   */
  function checkOverlappedPeriodsIfNeeded(context, params, result, next) {
    if (! context.stream.singleActivityRootId ||
        ! isPeriod(params) ||
        isRunning(params)) {
      // marks (can be duration of zero) and *running* periods cannot overlap
      return process.nextTick(next);
    }

    var endTime = params.time + params.duration;
    var query = {
      streamId: {$in: context.getSingleActivityExpandedIds()},
      $and: [
        {duration: {'$exists' : true}},
        {duration: {$ne: 0}}
      ],
      $or: [
        // earlier periods
        {
          time: {$lt: params.time},
          endTime: { $gt: params.time, $lte: timestamp.now() }
        },
        // later periods
        {time: { $gte: params.time, $lt: endTime }}
      ]
    };
    var options = {
      fields: {id: 1},
      sort: {time: 1}
    };
    userEventsStorage.find(context.user, query, options, function (err, periodEvents) {
      if (err) {
        return next(errors.unexpectedError(err));
      }

      if (params.id) {
        // ignore self
        periodEvents = periodEvents.filter(function (e) {
          return e.id !== params.id;
        });
      }

      if (periodEvents.length > 0) {
        var msg = 'The event\'s period overlaps existing period events.';
        return next(errors.periodsOverlap(msg,
            {overlappedIds: periodEvents.map(function (e) { return e.id; })}));
      }

      next();
    });
  }

  function stopPreviousPeriodIfNeeded(context, params, result, next) {
    if (! context.stream.singleActivityRootId ||
        ! isPeriod(params)) {
      // marks do not affect periods
      return process.nextTick(next);
    }

    var stopParams = {
      singleActivity: true,
      time: params.time
    };
    findLastRunning(context, stopParams, function (err, eventToStop) {
      if (err) { return next(errors.unexpectedError(err)); }
      stopEvent(context, eventToStop, params.time, function (err, stoppedId) {
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
    var query = {
      streamId: params.singleActivity ?
          {$in: context.getSingleActivityExpandedIds()} : context.stream.id,
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
        //TODO: remove saved files if any
        return callback(err);
      }

      // approximately update account storage size
      context.user.storageUsed.attachedFiles += sizeDelta;
      usersStorage.update({id: context.user.id}, {storageUsed: context.user.storageUsed},
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
          fileName: fileInfo.name,
          type: fileInfo.type,
          size: fileInfo.size
        });
        sizeDelta += fileInfo.size;
        done();
      });
    }
  }

  api.register('events.stop',
      commonFns.getParamsValidation(methodsSchema.stop.params),
      function (context, params, result, next) {
    // default time is now
    _.defaults(params, { time: timestamp.now() });

    if (params.id) {
      userEventsStorage.findOne(context.user, {id: params.id}, null, function (err, event) {
        if (err) { return next(errors.unexpectedError(err)); }
        if (! event) {
          return next(errors.unknownReferencedResource('event', 'id', params.id));
        }
        if (! isRunning(event)) {
          return next(errors.invalidOperation('Event "' + params.id + '" is not a running ' +
              'period event.'));
        }
        applyStop(null, event);
      });
    } else if (params.streamId) {
      context.setStream(params.streamId);
      if (! context.stream.singleActivityRootId && ! params.type) {
        return process.nextTick(next.bind(null, errors.invalidParametersFormat('You must specify ' +
            'the event `id` or `type` (not a "single activity" stream).')));
      }
      if (! checkStream(context, params.streamId, next)) { return; }
      var stopParams = {
        singleActivity: !! context.stream.singleActivityRootId,
        time: params.time,
        type: params.type
      };
      findLastRunning(context, stopParams, applyStop);
    } else {
      process.nextTick(next.bind(null, errors.invalidParametersFormat('You must specify either ' +
          'the "single activity " stream id or the event `id`.')));
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

    if (! context.canContributeToContext(event.streamId, event.tags)) {
      return process.nextTick(callback.bind(null, errors.forbidden()));
    }

    var updatedData = {
      // always include time: needed by userEventsStorage to update the DB-only "endTime" field
      time: event.time,
      duration: stopTime - event.time
    };

    utils.tracking.updateProperties(context.access.id, updatedData);

    userEventsStorage.update(context.user, {id: event.id}, updatedData, function (err) {
      if (err) {
        return callback(errors.unexpectedError(err));
      }
      callback(null, event.id);
    });
  }

  // DELETION

  api.register('events.delete',
      commonFns.getParamsValidation(methodsSchema.del.params),
      function (context, params, result, next) {
    checkEventForWriting(context, params.id, function (err, event) {
      if (err) { return next(err); }

      context.event = event;
      if (! event.trashed) {
        // move to trash
        flagAsTrashed(context, params, result, next);
      } else {
        // actually delete
        deleteWithData(context, params, result, next);
      }
    });
  });

  function flagAsTrashed(context, params, result, next) {
    var updatedData = {trashed: true};
    utils.tracking.updateProperties(context.access.id, updatedData);

    userEventsStorage.update(context.user, {id: params.id}, updatedData,
        function (err, updatedEvent) {
      if (err) { return next(errors.unexpectedError(err)); }

      result.event = updatedEvent;
      setFileReadToken(context.access, result.event);
      notifications.eventsChanged(context.user);
      next();
    });
  }

  function deleteWithData(context, params, result, next) {
    async.series([
      function (stepDone) {
        /* jshint -W024 */
        userEventsStorage.delete(context.user, {id: params.id}, function (err) {
          if (err) { return stepDone(errors.unexpectedError(err)); }

          result.eventDeletion = {id: params.id};
          notifications.eventsChanged(context.user);
          stepDone();
        });
      },
      userEventFilesStorage.removeAllForEvent.bind(userEventFilesStorage, context.user, params.id),
      function (stepDone) {
        // approximately update account storage size
        context.user.storageUsed.attachedFiles -= getTotalAttachmentsSize(context.event);
        usersStorage.update({id: context.user.id}, {storageUsed: context.user.storageUsed},
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
        checkEventForWriting(context, params.id, function (err, event) {
          if (err) { return stepDone(err); }

          updatedEvent = event;
          stepDone();
        });
      },
      function (stepDone) {
        var attIndex = getAttachmentIndex(updatedEvent.attachments, params.fileId);
        if (attIndex === -1) {
          return stepDone(errors.unknownResource('attachment', params.fileId));
        }
        deletedAtt = updatedEvent.attachments[attIndex];
        updatedEvent.attachments.splice(attIndex, 1);

        var updatedData = {attachments: updatedEvent.attachments};
        utils.tracking.updateProperties(context.access.id, updatedData);

        userEventsStorage.update(context.user, {id: params.id}, updatedData,
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
        usersStorage.update({id: context.user.id}, {storageUsed: context.user.storageUsed},
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
        new RegExp('^' + requestedType.substr(0, wildcardIndex + 1)) : requestedType;
  }

  function checkEventForWriting(context, eventId, callback) {
    userEventsStorage.findOne(context.user, {id: eventId}, null, function (err, event) {
      if (err) {
        return callback(errors.unexpectedError(err));
      }
      if (! event) {
        return callback(errors.unknownResource('event', eventId));
      }
      if (! context.canContributeToContext(event.streamId, event.tags)) {
        return callback(errors.forbidden());
      }

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
      att.readToken = utils.encryption.fileReadToken(att.id, access,
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

};
module.exports.injectDependencies = true;

var errors = require('../errors/factory'),
    async = require('async'),
    commonFns = require('./commonFunctions'),
    errorHandling = require('components/errors').errorHandling,
    methodsSchema = require('../schema/streamsMethods'),
    slugify = require('slug'),
    storage = require('components/storage'),
    string = require('../utils/string'),
    utils = require('components/utils'),
    treeUtils = utils.treeUtils,
    _ = require('lodash');

/**
 * Event streams API methods implementation.
 *
 * @param api
 * @param userStreamsStorage
 * @param userEventsStorage
 * @param notifications
 */
module.exports = function (api, userStreamsStorage, userEventsStorage, userEventFilesStorage,
                           notifications, logging) {

  var logger = logging.getLogger('methods/streams');

  // COMMON

  api.register('streams.*',
      commonFns.loadAccess);

  // RETRIEVAL

  api.register('streams.get',
      commonFns.getParamsValidation(methodsSchema.get.params),
      applyDefaultsForRetrieval,
      findAccessibleStreams,
      includeDeletionsIfRequested);

  function applyDefaultsForRetrieval(context, params, result, next) {
    _.defaults(params, {
      parentId: null,
      includeDeletionsSince: false
    });
    next();
  }

  function findAccessibleStreams(context, params, result, next) {
    // can't reuse context streams (they carry extra internal properties)
    userStreamsStorage.find(context.user, {}, null, function (err, streams) {
      if (err) { return next(errors.unexpectedError(err)); }

      if (params.parentId) {
        var parent = treeUtils.findById(streams, params.parentId);
        if (! parent) {
          return next(errors.unknownReferencedResource('parent stream', 'parentId', params.parentId,
              err));
        }
        streams = parent.children;
      }

      if (params.state !== 'all') { // i.e. === 'default' (return non-trashed items)
        streams = treeUtils.filterTree(streams, false /*no orphans*/, function (item) {
          return ! item.trashed;
        });
      }

      if (! context.access.isPersonal()) {
        streams = treeUtils.filterTree(streams, true /*keep orphans*/, function (stream) {
          return context.canReadStream(stream.id);
        });
      }

      // hide inaccessible parent ids
      streams.forEach(function (stream) {
        if (! context.canReadStream(stream.parentId)) {
          delete stream.parentId;
        }
      });

      result.streams = streams;
      next();
    });
  }

  function includeDeletionsIfRequested(context, params, result, next) {
    if (! params.includeDeletionsSince) { return next(); }

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
      commonFns.getParamsValidation(methodsSchema.create.params),
      applyDefaultsForCreation,
      applyPrerequisitesForCreation,
      createStream);

  function applyDefaultsForCreation(context, params, result, next) {
    _.defaults(params, {parentId: null});
    next();
  }

  function applyPrerequisitesForCreation(context, params, result, next) {
    if (! context.canManageStream(params.parentId)) {
      return process.nextTick(next.bind(null, errors.forbidden()));
    }

    // strip ignored properties
    if (params.hasOwnProperty('children')) {
      delete params.children;
    }

    if (params.id) {
      if (string.isReservedId(params.id) ||
          string.isReservedId(params.id = slugify(params.id))) {
        return process.nextTick(next.bind(null, errors.invalidItemId('The specified id "' +
            params.id + '" is not allowed.')));
      }
    }

    utils.tracking.initProperties(context.access.id, params);

    next();
  }

  function createStream(context, params, result, next) {
    userStreamsStorage.insertOne(context.user, params, function (err, newStream) {
      if (err) {
        if (storage.Database.isDuplicateError(err)) {
          // HACK: relying on error text as nothing else available to differentiate
          var apiError = err.err.indexOf('_id_') > 0 ?
              errors.itemAlreadyExists('stream', {id: params.id}, err) :
              errors.itemAlreadyExists('sibling stream', {name: params.name}, err);
          return next(apiError);
        } else {
          // for now we just assume the parent is unknown
          return next(errors.unknownReferencedResource('parent stream', 'parentId', params.parentId,
              err));
        }
      }

      result.stream = newStream;
      notifications.streamsChanged(context.user);
      next();
    });
  }

  // UPDATE

  api.register('streams.update',
      commonFns.getParamsValidation(methodsSchema.update.params),
      applyPrerequisitesForUpdate,
      updateStream);

  function applyPrerequisitesForUpdate(context, params, result, next) {
    // strip ignored properties if there (read-only)
    delete params.update.id;
    delete params.update.children;

    // check stream
    var stream = treeUtils.findById(context.streams, params.id);
    if (! stream) {
      return process.nextTick(next.bind(null,
          errors.unknownResource('stream', params.id)));
    }
    if (! context.canManageStream(stream.id)) {
      return process.nextTick(next.bind(null, errors.forbidden()));
    }

    // check target parent if needed
    if (params.update.parentId && ! context.canManageStream(params.update.parentId)) {
      return process.nextTick(next.bind(null, errors.forbidden()));
    }

    utils.tracking.updateProperties(context.access.id, params.update);

    next();
  }

  function updateStream(context, params, result, next) {
    userStreamsStorage.update(context.user, {id: params.id}, params.update,
        function (err, updatedStream) {
      if (err) {
        if (storage.Database.isDuplicateError(err)) {
          return next(errors.itemAlreadyExists('sibling stream', {name: params.update.name}, err));
        } else {
          // for now we just assume the parent is unknown
          return next(errors.unknownReferencedResource('parent stream', 'parentId',
              params.update.parentId, err));
        }
      }

      result.stream = updatedStream;
      notifications.streamsChanged(context.user);
      next();
    });
  }

  // DELETION

  api.register('streams.delete',
      commonFns.getParamsValidation(methodsSchema.del.params),
      applyPrerequisitesForDeletion,
      deleteStream);

  function applyPrerequisitesForDeletion(context, params, result, next) {
    _.defaults(params, { mergeEventsWithParent: null });

    // check stream
    context.stream = treeUtils.findById(context.streams, params.id);
    if (! context.stream) {
      return process.nextTick(next.bind(null,
          errors.unknownResource('stream', params.id)));
    }
    if (! context.canManageStream(context.stream.id)) {
      return process.nextTick(next.bind(null, errors.forbidden()));
    }

    next();
  }

  function deleteStream(context, params, result, next) {
    if (! context.stream.trashed) {
      // move to trash
      flagAsTrashed(context, params, result, next);
    } else {
      // actually delete
      deleteWithData(context, params, result, next);
    }
  }

  function flagAsTrashed(context, params, result, next) {
    var updatedData = {trashed: true};
    utils.tracking.updateProperties(context.access.id, updatedData);

    userStreamsStorage.update(context.user, {id: params.id}, updatedData,
        function (err, updatedStream) {
      if (err) { return next(errors.unexpectedError(err)); }

      result.stream = updatedStream;
      notifications.streamsChanged(context.user);
      next();
    });
  }

  function deleteWithData(context, params, result, next) {
    var itemAndDescendantIds,
        parentId,
        linkedEventIds;
    async.series([
      function retrieveIdsToDelete(stepDone) {
        userStreamsStorage.find(context.user, {}, null, function (err, streams) {
          if (err) { return stepDone(errors.unexpectedError(err)); }

          var item = treeUtils.findById(streams, params.id);
          //no need to check existence: done before already
          itemAndDescendantIds = treeUtils.collectPluckFromRootItem(item, 'id');
          parentId = item.parentId;

          stepDone();
        });
      },
      function retrieveLinkedEventIds(stepDone) {
        userEventsStorage.find(context.user, {streamId: {$in: itemAndDescendantIds}},
            {fields: {id: 1}}, function (err, linkedEvents) {
          if (err) {
            return stepDone(errors.unexpectedError(err));
          }

          linkedEventIds = _.pluck(linkedEvents, 'id');

          if (linkedEventIds.length > 0 && params.mergeEventsWithParent === null) {
            return stepDone(errors.invalidParametersFormat('There are events referring to the ' +
                'deleted items and the `mergeEventsWithParent` parameter is missing.'));
          }

          stepDone();
        });
      },
      function handleLinkedEvents(stepDone) {
        if (linkedEventIds.length === 0) {
          return stepDone();
        }

        if (params.mergeEventsWithParent) {
          userEventsStorage.updateMultiple(context.user, {id: {$in: linkedEventIds}},
              {streamId: parentId}, function (err) {
            if (err) { return stepDone(errors.unexpectedError(err)); }

            notifications.eventsChanged(context.user);
            stepDone();
          });
        } else {
          /* jshint -W024 */
          userEventsStorage.delete(context.user, {id: {$in: linkedEventIds}}, function (err) {
            if (err) { return stepDone(errors.unexpectedError(err)); }

            // async delete attached files (if any) – don't wait for this, just log possible errors
            linkedEventIds.forEach(function (evtId) {
              userEventFilesStorage.removeAllForEvent(context.user, evtId, function (err) {
                if (err) {
                  errorHandling.logError(err, null, logger);
                }
              });
            });

            notifications.eventsChanged(context.user);
            stepDone();
          });
        }
      },
      function deleteStreams(stepDone) {
        userStreamsStorage.delete(context.user, {id: {$in: itemAndDescendantIds}}, function (err) {
          if (err) { return stepDone(errors.unexpectedError(err)); }

          result.streamDeletion = {id: params.id};
          notifications.streamsChanged(context.user);
          stepDone();
        });
      }
    ], next);
  }

};
module.exports.injectDependencies = true;

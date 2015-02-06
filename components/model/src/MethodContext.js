var accessLogic = require('./accessLogic'),
    APIError = require('components/errors').APIError,
    async = require('async'),
    errors = require('components/errors').factory,
    treeUtils = require('components/utils').treeUtils,
    _ = require('lodash');

module.exports = MethodContext;
/**
 * Retrieves and holds contextual info for a given API method.
 *
 * @param {String} username
 * @param {String} accessToken
 * @param {Object} storage Must have properties `users`, `accesses` and `streams`
 * @constructor
 */
function MethodContext(username, accessToken, storage) {
  this.username = username;
  this.accessToken = accessToken;

  this.user = null;
  this.access = null;

  this.streams = null;

  this.storage = storage;
}

/**
 * @param {Function} callback ({APIError} error)
 */
MethodContext.prototype.retrieveUser = function (callback) {
  this.storage.users.findOne({username: this.username}, null, function (err, user) {
    if (err) {
      return callback(errors.unexpectedError(err));
    }
    if (! user) {
      return callback(errors.unknownResource('user', this.username));
    }

    this.user = user;
    callback();
  }.bind(this));
};

/**
 * Retrieves the context's access from its token (set at init time) and expand its permissions
 * (e.g. to include child streams). Also sets `context.streams`.
 *
 * If the context's access is already set, the initial step is skipped. This allows callers to
 * implement custom retrieval logic if needed (e.g. using a read token for attached files).
 *
 * @param {Function} callback ({APIError} error)
 */
MethodContext.prototype.retrieveExpandedAccess = function (callback) {
  if (! this.accessToken && ! this.access) {
    return callback(errors.invalidAccessToken('The access token is missing: expected an ' +
        '"Authorization" header or an "auth" query string parameter.'));
  }

  async.waterfall([
    function retrieveAccess(stepDone) {
      if (this.access) {
        // custom access retrieval: skip this step
        return stepDone();
      }

      this.storage.accesses.findOne(this.user, {token: this.accessToken}, null,
          function (err, access) {
        if (err) { return stepDone(err); }

        if (! access) {
          return stepDone(errors.invalidAccessToken('Cannot find access from token "' +
              this.accessToken + '".'));
        }

        this.access = access;
        stepDone();
      }.bind(this));
    }.bind(this),

    function checkAccess(stepDone) {
      if (this.access.type === 'personal') {
        // check session validity
        this.storage.sessions.get(this.access.token, stepDone);
      } else {
        stepDone(null, null);
      }
    }.bind(this),

    function checkSessionIfPersonal(sessionData, stepDone) {
      if (this.access.type !== 'personal') { return stepDone(); }

      if (! sessionData) {
        return stepDone(errors.invalidAccessToken('Access session has expired.'));
      }
      // keep alive
      this.storage.sessions.touch(this.access.token, function () {});
      stepDone();
    }.bind(this),

    function extendAccess1(stepDone) {
      _.extend(this.access, accessLogic);
      this.storage.streams.find(this.user, {}, null, stepDone);
    }.bind(this),

    function extendAccess2(streams, stepDone) {
      applyInheritedProperties(streams);
      this.streams = streams;

      if (! this.access.isPersonal()) {
        this.access.loadPermissions(this.streams);
      }

      stepDone();
    }.bind(this)
  ], function (err) {
    if (! err instanceof APIError) {
      err = errors.unexpectedError(err);
    }
    callback(err || null);
  });
};

/**
 * @param {Array} streams
 * @param {Object} properties
 */
function applyInheritedProperties(streams, properties) {
  if (! properties) {
    properties = {};
  }
  for (var i = 0, length = streams.length; i < length; i++) {
    var stream = streams[i];

    _.defaults(stream, properties);
    var childrenProperties = _.clone(properties);

    if (stream.singleActivity) {
      var extension = {singleActivityRootId: stream.id};
      _.defaults(stream, extension);
      _.defaults(childrenProperties, extension);
    }

    applyInheritedProperties(stream.children, childrenProperties);
  }
}

/**
 * @param {String} streamId
 */
MethodContext.prototype.setStream = function (streamId) {
  this.stream = treeUtils.findById(this.streams, streamId);
};

/**
 * @return {Array} Expanded ids of single-activity streams for the context, based on context.stream
 */
MethodContext.prototype.getSingleActivityExpandedIds = function () {
  if (! this.singleActivityExpandedIds) {
    if (! this.stream) {
      throw new Error('The context\'s `stream` must be set before calling this method.');
    }
    this.singleActivityExpandedIds = this.stream.singleActivityRootId ?
        treeUtils.expandIds(this.streams, [this.stream.singleActivityRootId]) : [];
  }
  return this.singleActivityExpandedIds;
};

/**
 * Sugar for the corresponding access method.
 */
MethodContext.prototype.canReadStream = function (streamId) {
  return this.access.canReadStream(streamId);
};

/**
 * Sugar for the corresponding access method.
 */
MethodContext.prototype.canManageStream = function (streamId) {
  return this.access.canManageStream(streamId);
};

/**
 * Sugar for the corresponding access method.
 */
MethodContext.prototype.canReadTag = function (tag) {
  return this.access.canReadTag(tag);
};

/**
 * Sugar for the corresponding access method.
 */
MethodContext.prototype.canManageTag = function (tag) {
  return this.access.canManageTag(tag);
};

/**
 * Whether events in the given stream and tags context can be read.
 *
 * @param streamId
 * @param tags
 * @returns {Boolean}
 */
MethodContext.prototype.canReadContext = function (streamId, tags) {
  return this.access.canReadStream(streamId) &&
      (this.access.canReadAllTags() || _.any(tags || [], this.access.canReadTag.bind(this.access)));
};

/**
 * Whether events in the given stream and tags context can be created/updated/deleted.
 *
 * @param streamId
 * @param tags
 * @returns {Boolean}
 */
MethodContext.prototype.canContributeToContext = function (streamId, tags) {
  return this.access.canContributeToStream(streamId) ||
      (this.access.canContributeToTag('*') ||
       _.any(tags || [], this.access.canContributeToTag.bind(this.access)));
};

MethodContext.prototype.clone = function () {
  var clone = new MethodContext();
  _.extend(clone, this);
  return clone;
};

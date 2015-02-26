var async = require('async'),
    APIError = require('components/errors').APIError,
    errors = require('components/errors').factory;

module.exports = API;
/**
 * Maps each API method's implementation as a chain of functions (akin to middleware) to its id.
 * Handles method calls coming from HTTP or web sockets.
 *
 * @constructor
 */
function API() {
  /**
   * Each key is a method id, each value is the array of functions implementing it.
   */
  this.map = {};
  /**
   * @type {Array({{String} idFilter, {Array} fns})}
   */
  this.filters = [];
}

// REGISTRATION

/**
 * The string used as wildcard for method id filters. Must be 1-character long.
 *
 * @type {string}
 */
var wildcard = '*';

/**
 * Registers the given function(s) with the given method id.
 * The given function(s) will be appended, in order, to the list of previously registered functions.
 * The method id can end with a '*' wildcard, in which case the function(s) will apply to all method
 * ids that match.
 *
 * Example use:
 *
 * - `api.register('resources.*', commonFn)`
 * - `api.register('resources.get', fn1, fn2, ...)`
 */
API.prototype.register = function (/* arguments: id, fn1, fn2, ... */) {
  var id = arguments[0],
      fns = [].slice.call(arguments, 1),
      wildcardAt = id.indexOf(wildcard);
  if (wildcardAt === -1) {
    // full method id (no wildcard)
    if (! this.map[id]) {
      // new method
      this.map[id] = [];
      // prepend with matching filters registered earlier, if any
      this.applyMatchingFilters(id);
    }
    // append registered functions
    this.map[id].push.apply(this.map[id], fns);
  } else {
    // filter (with wildcard)
    if (wildcardAt !== id.length - 1) {
      throw new Error('Wildcard is only allowed as suffix.');
    }
    var filter = {
      idFilter: id,
      fns: fns
    };
    this.applyToMatchingIds(filter);
    // save filter for applying to methods registered later
    this.filters.push(filter);
  }
};

/**
 * @private
 */
API.prototype.applyMatchingFilters = function (id) {
  this.filters.forEach(function (filter) {
    this.applyIfMatches(filter, id);
  }.bind(this));
};

/**
 * @private
 */
API.prototype.applyToMatchingIds = function (filter) {
  Object.keys(this.map).forEach(function (id) {
    this.applyIfMatches(filter, id);
  }.bind(this));
};

/**
 * @private
 */
API.prototype.applyIfMatches = function (filter, id) {
  if (matches(filter.idFilter, id)) {
    this.map[id].push.apply(this.map[id], filter.fns);
  }
};

function matches(idFilter, id) {
  // i.e. check whether the given id starts with the given filter without the wildcard
  return id.indexOf(idFilter.slice(0, -1)) === 0;
}

// HANDLING CALLS

API.prototype.has = function (id) {
  return !! this.map[id];
};

API.prototype.call = function (id, context, params, callback) {
  var fns = this.map[id];
  if (! fns) {
    return callback(errors.invalidMethod(id));
  }

  if (context) {
    // add called method id to context for instrumentation
    context.calledMethodId = id;
  }

  var result = {};
  async.forEachSeries(fns, function (currentFn, next) {
    try {
      currentFn(context, params, result, next);
    } catch (err) {
      next(err);
    }
  }, function (err) {
    if (err) {
      return callback(err instanceof APIError ? err : errors.unexpectedError(err));
    }
    callback(null, result);
  });
};

/**
 * Regroups the different URL paths served by this module.
 */

var Params = {
  Username: 'username'
};
Object.freeze(Params);

var Paths = module.exports = {
  // expose params for URL parsing
  Params: Params,

  System: path('system'),
  /* TODO remove: temporarily kept for backwards-compat */
  Register: path('register'),

  UserRoot: path(param(Params.Username)),

  Accesses: path(param(Params.Username), 'accesses'),
  Account: path(param(Params.Username), 'account'),
  Auth: path(param(Params.Username), 'auth'),
  FollowedSlices: path(param(Params.Username), 'followed-slices'),
  Streams: path(param(Params.Username), 'streams'),
  Events: path(param(Params.Username), 'events'),
  Profile: path(param(Params.Username), 'profile'),

  SocketIO: path('socket.io'),
  Favicon: path('favicon.ico')
};
Object.freeze(Paths);

function path(/* path elements */) {
  var args = [].slice.call(arguments);
  args.unshift('/');
  return require('path').join.apply(null, args);
}

function param(name) {
  return ':' + name;
}

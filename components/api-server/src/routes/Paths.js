/**
 * Regroups the different URL paths served by this module.
 */

const Params = {
  Username: 'username'
};
Object.freeze(Params);


const username = param(Params.Username);
const Paths = module.exports = {
  // expose params for URL parsing
  Params: Params,

  System: path('system'),
  /* TODO remove: temporarily kept for backwards-compat */
  Register: path('register'),

  UserRoot: path(username),

  Accesses: path(username, 'accesses'),
  Account: path(username, 'account'),
  Auth: path(username, 'auth'),
  FollowedSlices: path(username, 'followed-slices'),
  Streams: path(username, 'streams'),
  Events: path(username, 'events'),
  Profile: path(username, 'profile'),

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

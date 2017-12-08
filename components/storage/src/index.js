// @flow

module.exports = {
  Database: require('./Database'),
  PasswordResetRequests: require('./PasswordResetRequests'),
  Sessions: require('./Sessions'),
  Size: require('./Size'),
  Users: require('./Users'),
  Versions: require('./Versions'),
  user: {
    Accesses: require('./user/Accesses'),
    EventFiles: require('./user/EventFiles'),
    Events: require('./user/Events'),
    FollowedSlices: require('./user/FollowedSlices'),
    Profile: require('./user/Profile'),
    Streams: require('./user/Streams')
  }
};

type StorageLayer = {
  versions: exports.Versions,
  passwordResetRequests: exports.PasswordResetRequests,
  sessions: exports.Sessions,
  users: exports.Users,
  accesses: exports.user.Accesses,
  eventFiles: exports.user.EventFiles,
  events: exports.user.Events,
  followedSlices: exports.user.FollowedSlices,
  profile: exports.user.Profile,
  streams: exports.user.Streams,
  
  waitForConnection(): Promise<mixed>, 
}
export type { StorageLayer };


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

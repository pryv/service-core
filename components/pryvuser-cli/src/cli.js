#! /usr/bin/env node

/**
 * For now it's just "delete" until we make a full account management CLI.
 * Followed up on: https://trello.com/c/LtfQuedy/85
 */

var program = require('commander'),
    output = require('./utils/output'),
    path = require('path'),
    storage = require('components/storage'),
    utils = require('components/utils');

program.version(require('../package.json').version)
    .description('Utility to manipulate Pryv user accounts')
    .option('--config [path]',
        'Config file path; the default is "api-server.config.json" in the working dir');

var settings = utils.config.load(path.resolve(process.cwd(), 'api-server.config.json')),
    logging = utils.logging(settings.logs),
    database = new storage.Database(settings.database, logging),
    usersStorage = new storage.Users(database),
    userAccessesStorage = new storage.user.Accesses(database),
    userEventFilesStorage = new storage.user.EventFiles(settings.eventFiles, logging),
    userEventsStorage = new storage.user.Events(database),
    userFollowedSlicesStorage = new storage.user.FollowedSlices(database),
    userProfileStorage = new storage.user.Profile(database),
    userStreamsStorage = new storage.user.Streams(database);

// register commands
require('./commands/delete')(program, logging, usersStorage, userAccessesStorage, userEventsStorage,
    userEventFilesStorage, userFollowedSlicesStorage, userProfileStorage, userStreamsStorage);

// handle unknown commands
program.on('*', function (unknownCommand) {
  output.print('\nerror: unknown command `' + unknownCommand + '`');
  program.help();
});

program.parse(process.argv);

// when no arg, just print help
if (program.args.length < 1) {
  program.help();
}


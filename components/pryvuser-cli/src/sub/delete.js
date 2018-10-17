// @flow

import type { CommonParams } from '../app'; 

const logger = console; 

type DeleteParams = {
  parent: CommonParams,
}

class OpDeleteUser {
  run(username: string, params: DeleteParams) {
    logger.log('About to delete', username, params);
  }

  /// Registers this command in the 'commander' program instance given as 
  /// first parameter `program`. 
  ///
  subcommandOf(program: any) {
    program
      .command('delete-user <username>')
      .description('Delete a user (identified by <username>) completely from the system.')
      .action((username, params) => {
        this.run(username, params);
      });
  }
}

module.exports = OpDeleteUser;

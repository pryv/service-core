// @flow

import type { CommonParams } from '../app'; 
import type { ConfigurationLoader } from '../configuration';
import type Configuration from '../configuration';

import type { MongoDBConnection, InfluxDBConnection, RegistryConnection } 
  from '../connection_manager';

type DeleteParams = {
  parent: CommonParams,
}

const ConnectionManager = require('../connection_manager');

class OpDeleteUser {
  configurationLoader: $ReadOnly<ConfigurationLoader>; 
  interaction: Interaction; 

  constructor(configLoader: $ReadOnly<ConfigurationLoader>) {
    this.configurationLoader = configLoader;
    this.interaction = new Interaction(); 
  }

  /// Delete a user completely, provided the checks are all green. This is 
  /// the main entry point used by tests and the commander interface. 
  /// 
  async run(username: string, params: DeleteParams) {
    params;

    const i = this.interaction;

    try {
      const config = await this.loadConfiguration();

      i.printConfigSummary(config);

      const connManager = new ConnectionManager(config);
      await this.preflightChecks(connManager);

      await this.getUserConfirmation(username); 

      // Now connections in `connManager` are good and the user consents to 
      // deletion. Let's go!

      await this.deleteUser(username, connManager);    
    }
    catch (error) {
      i.error(`Unknown error: ${error.message}`);
      i.trace(error);
    }
  }

  /// Performs actual deletion. If the deletion fails, the process exits with 
  /// exit code 3. 
  /// 
  async deleteUser(username: string, connManager: ConnectionManager) {
    const i = this.interaction;

    const deleteActions: Array<[string, Operation]> = [
      ['InfluxDB', new InfluxDBDeleteUser(await connManager.influxDbConnection())],
      ['MongoDB', new MongoDBDeleteUser(await connManager.mongoDbConnection())],
      ['Pryv.IO Registry', new RegistryDeleteUser(await connManager.registryConnection())],
    ];

    for (const [systemName, operation] of deleteActions) {
      i.print(`[${systemName}] Deleting '${username}'...`);

      try {
        await operation.run(); 
        i.println('done.');
      }
      catch (error) {
        i.error(`Operation failed: ${error}`);
        i.println('Operation aborts.');
        process.exit(3);

        // NOT REACHED
      }
    }

    i.itsOk(`User '${username}' was sucessfully deleted.`);

    // NOTE Exactly like preflightChecks for now. Not extracting the pattern 
    //  at this stage. 
  }

  /// Asks the user to confirm deletion. If the user says no, the process
  /// exits with code 2. 
  /// 
  async getUserConfirmation(username: string) {
    const i = this.interaction;
    i.println(`About to delete the user '${username}'.`);

    const userConfirms = await i.askYN('Do you confirm?', false);
    if (! userConfirms) process.exit(2);
  }

  /// Loads the configuration files and returns a `Configuration` instance. 
  /// 
  async loadConfiguration(): Promise<Configuration> {
    const configLoader = this.configurationLoader;
    const config = await configLoader.load(process.cwd());

    return config; 
  }

  /// Performs preflight checks on all connections; if any check fails, the
  /// process is exited with code 1. 
  /// 
  async preflightChecks(connManager: ConnectionManager) {
    const i = this.interaction;

    const preflightChecks: Array<[string, Operation]> = [
      ['MongoDB', new MongoDBConnectionCheck(await connManager.mongoDbConnection())],
      ['InfluxDB', new InfluxDBConnectionCheck(await connManager.influxDbConnection())],
      ['Pryv.IO Registry', new RegistryConnectionCheck(await connManager.registryConnection())],
    ];

    for (const [systemName, check] of preflightChecks) {
      i.print(`[preflight] Checking ${systemName}...`);

      const error = await check.run();
      if (error != null) {
        i.error(`Check failed: ${error}`);
        process.exit(1);
        // NOT REACHED
      }

      i.println('ok.');
    }

    i.println('Preflight checks are complete.');
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

class Interaction {
  /// Prints a configuration summary. 
  /// 
  printConfigSummary(config: Configuration) {
    config;
    throw new Error('Not Implemented');
  }  

  /// Simply prints a string.
  /// 
  print(str: string) {
    str;
    throw new Error('Not Implemented');
  }

  /// Prints a string followed by a newline (\n).
  /// 
  println(str: string) {
    str;
    throw new Error('Not Implemented');
  }

  /// Prints an error, possibly using color. 
  /// 
  error(str: string) {
    console.error(str); // eslint-disable-line no-console
  }

  trace(error: Error) {
    console.trace(error); // eslint-disable-line no-console
  }

  /// Prints something good, possibly in green. 
  /// 
  itsOk(str: string) {
    str;
    throw new Error('Not Implemented');
  }

  /// Asks the user a question, accepting answers Yes and No. If
  /// the user just presses enter, the default (`def`) answer will be given. 
  /// 
  async askYN(question: string, def: boolean=false): Promise<boolean> {
    return def; 
  }
}

interface Operation {
  run(): Promise<void>,
}

class MongoDBConnectionCheck implements Operation {
  constructor(conn: MongoDBConnection) { conn; }
  run(): Promise<void> {
    throw new Error('Not Implemented');
  }
}
class InfluxDBConnectionCheck implements Operation {
  constructor(conn: InfluxDBConnection) { conn; }
  run(): Promise<void> {
    throw new Error('Not Implemented');
  }
}
class RegistryConnectionCheck implements Operation {
  constructor(conn: RegistryConnection) { conn; }
  run(): Promise<void> {
    throw new Error('Not Implemented');
  }
}

class MongoDBDeleteUser implements Operation {
  constructor(conn: MongoDBConnection) { conn; }
  run(): Promise<void> {
    throw new Error('Not Implemented');
  }
}
class InfluxDBDeleteUser implements Operation {
  constructor(conn: InfluxDBConnection) { conn; }
  run(): Promise<void> {
    throw new Error('Not Implemented');
  }
}
class RegistryDeleteUser implements Operation {
  constructor(conn: RegistryConnection) { conn; }
  run(): Promise<void> {
    throw new Error('Not Implemented');
  }
}
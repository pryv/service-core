// @flow

import type { CommonParams } from '../app'; 
import type { ConfigurationLoader } from '../configuration';
import type Configuration from '../configuration';

type DeleteParams = {
  parent: CommonParams,
}

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
      await this.preflightChecks(connManager, i);

      // Now connections in `connManager` are good and the user consents to 
      // deletion. Let's go!

      await this.deleteUser(username, connManager, i);    
    }
    catch (error) {
      i.error(`Unknown error: ${error.toString()}`);
    }
  }

  async deleteUser(username: string, connManager: ConnectionManager, i: Interaction) {
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
        process.exit(2);

        // NOT REACHED
      }
    }

    i.itsOk(`User '${username}' was sucessfully deleted.`);

    // NOTE Exactly like preflightChecks for now. Not extracting the pattern 
    //  at this stage. 
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
  async preflightChecks(connManager: ConnectionManager, i: Interaction) {
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
    str;
    throw new Error('Not Implemented');
  }

  /// Prints something good, possibly in green. 
  /// 
  itsOk(str: string) {
    str;
    throw new Error('Not Implemented');
  }
}

class MongoDBConnection { }
class InfluxDBConnection { }
class RegistryConnection { }

class ConnectionManager {
  constructor(config: Configuration) {
    config;
  }

  mongoDbConnection(): Promise<MongoDBConnection> {
    throw new Error('Not Implemented');
  }

  influxDbConnection(): Promise<InfluxDBConnection> {
    throw new Error('Not Implemented');
  }

  registryConnection(): Promise<RegistryConnection> {
    throw new Error('Not Implemented');
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
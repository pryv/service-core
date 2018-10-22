// @flow

import type { CommonParams } from '../app'; 
import type { ConfigurationLoader } from '../configuration';
import type Configuration from '../configuration';

type DeleteParams = {
  parent: CommonParams,
}

const assert = require('assert');
const ConnectionManager = require('../connection_manager');

class OpDeleteUser {
  configurationLoader: $ReadOnly<ConfigurationLoader>; 
  interaction: Interaction; 

  subsystems: Array<Subsystem>;

  constructor(configLoader: $ReadOnly<ConfigurationLoader>) {
    this.configurationLoader = configLoader;
    this.interaction = new Interaction(); 

    this.subsystems = []; 
  }

  /// Delete a user completely, provided the checks are all green. This is 
  /// the main entry point used by tests and the commander interface. 
  /// 
  async run(username: string, params: DeleteParams) {
    const i = this.interaction;
    try {
      this.runWithoutErrorHandling(username);
    }
    catch (error) {
      i.error(`Unknown error: ${error.message}`);
      i.trace(error);
    }
  }

  async runWithoutErrorHandling(username: string) {
    const i = this.interaction;

    const config = await this.loadConfiguration();

    i.printConfigSummary(config);

    const connManager = new ConnectionManager(config);

    await this.initSubsystems(connManager);

    await this.preflightChecks(username);

    await this.getUserConfirmation(username);

    // Now connections in `connManager` are good and the user consents to 
    // deletion. Let's go!

    await this.deleteUser(username);    
  }

  async initSubsystems(connManager: ConnectionManager) {
    const subsystems = this.subsystems;

    assert(subsystems.length <= 0, "You shouldn't reuse OpDeleteUser");

    subsystems.push(
      new Thin('MongoDB', await connManager.mongoDbConnection()), 
      new Thin('InfluxDB', await connManager.influxDbConnection()),
      new Thin('File Store', await connManager.fileStoreConnection()), 
      new Thin('Registry', await connManager.registryConnection()),
    );
  }

  /// Performs actual deletion. If the deletion fails, the process exits with 
  /// exit code 3. 
  /// 
  async deleteUser(username: string) {
    const i = this.interaction;
    const subsystems = this.subsystems;

    for (const system of subsystems) {
      i.print(`[${system.name}] Deleting '${username}'...`);

      try {
        await system.deleteUser(username);
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
  async preflightChecks(username: string) {
    const i = this.interaction;
    const subsystems = this.subsystems;

    for (const system of subsystems) {
      i.print(`[preflight] Checking ${system.name}...`);

      try {
        await system.preflight(username);
      }
      catch (error) {
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
    
    const i = this; 
    i.println('Found the following configuration files: ');
    i.println(`core: ${config.coreConfigPath()}`);
    i.println(`hfs: ${config.hfsConfigPath()}`);
    i.println(''); 
  }  

  /// Simply prints a string.
  /// 
  print(str: string) {
    process.stdout.write(str);
  }

  /// Prints a string followed by a newline (\n).
  /// 
  println(str: string) {
    console.log(str); // eslint-disable-line no-console
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
    console.info(str); // eslint-disable-line no-console
  }

  /// Asks the user a question, accepting answers Yes and No. If
  /// the user just presses enter, the default (`def`) answer will be given. 
  /// 
  async askYN(question: string, def: boolean=false): Promise<boolean> {
    return def; 
  }
}

interface Subsystem {
  name: string; 
  preflight(username: string): Promise<void>;
  deleteUser(username: string): Promise<void>;
}

interface GenericConnection {
  preflight(username: string): Promise<void>;
  deleteUser(username: string): Promise<void>;
}

// Represents a backend system that we perform user deletion on. Right now, 
// all the backends can be treated the same way; no specialised code is needed
// in this 'subsystem' layer. As a consequence, we use this 'generic' Thin
// subsystem to replace the layer for now. 
// 
// Behaviour that would go into this layer: Anything more complex than letting
// a single data backend handle the operation. 
// 
class Thin implements Subsystem {
  name: string; 
  conn: *; 
  constructor(name: string, conn: GenericConnection) {
    this.name = name;
    this.conn = conn;
  }

  preflight(username: string): Promise<void> {
    const conn = this.conn; 
    
    return conn.preflight(username);
  }

  deleteUser(username: string): Promise<void> {
    const conn = this.conn;

    // return conn.deleteUser(username);
  }
}

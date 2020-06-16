// @flow

const Configuration = require('./configuration');

class App {
  program: any;

  constructor() {
    this.program = setupCommander();
  }

  run() {
    const { program } = this;

    // If no arguments were given, default to printing the help.
    if (!process.argv.slice(2).length) {
      program.outputHelp();
      process.exit(0);
    }

    // Parse the command line arguments; triggers subcommand actions.
    program.parse(process.argv);
  }
}

module.exports = App;

/// Configures the commander instance.
///
function setupCommander(): any {
  const program = require('commander');

  program
    .option('-n, --no-interaction', 'Runs without prompting for confirmation.');

  // Register all subcommands in the list below. The files must export a class
  // as their sole export and the class must have a method #subcommandOf(program)
  // that registers the subcommand in the commander DSL object.

  const subcommandKlasses = [
    require('./sub/delete'),
  ];

  for (const klass of subcommandKlasses) {
    const instance = new klass(Configuration);
    instance.subcommandOf(program);
  }

  return program;
}

export type CommonParams = {
  interaction: boolean, // --no-interaction
}

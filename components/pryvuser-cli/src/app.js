// @flow

const stdout = console; 

class App {
  program: any; 

  constructor() {
    this.program = setupCommander(); 
  }

  run() {
    const program = this.program;
    const params = program.parse(process.argv);

    if (!process.argv.slice(2).length) {
      program.outputHelp();
    }
  }
}

module.exports = App; 

function setupCommander(): any {
  const program = require('commander');

  program
    .version('1.3.0')
    .option('-n, --no-interaction', 'Runs without prompting for confirmation.');

  // Register all subcommands in the list below. The files must export a class
  // as their sole export and the class must have a method #subcommandOf(program)
  // that registers the subcommand in the commander DSL object. 

  const subcommandKlasses = [
    require('./sub/delete')
  ];

  for (let klass of subcommandKlasses) {
    const instance = new klass();
    instance.subcommandOf(program);
  }

  return program; 
}

export type CommonParams = {
  interaction: boolean, // --no-interaction
}

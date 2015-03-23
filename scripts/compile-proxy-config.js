var fs = require('fs'),
    path = require('path'),
    _ = require('lodash'),
    args = process.argv.slice(2);

if (args.length < 1) {
  fail('Environment ("development" or "production") argument required');
}

var env = args[0];
if (env !== 'development' && env !== 'production') {
  fail('Environment must be either "development" or "production"');
}

var dir = __dirname + '/../proxy',
    varsFile = path.resolve(dir, 'vars.' + env + '.js'),
    templateFile = path.resolve(dir, 'nginx.conf.template'),
    outputFile = path.resolve(dir, 'nginx.conf');

console.log('Compiling Nginx configuration for ' + env + ' into "' + outputFile + '"...');

var output = _.template(fs.readFileSync(templateFile))(require(varsFile));
fs.writeFileSync(outputFile, output);

console.log('Done.');


function fail(message) {
  console.error(message);
  process.exit(1);
}

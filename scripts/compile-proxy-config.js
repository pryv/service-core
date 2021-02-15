/**
 * @license
 * Copyright (C) 2012-2021 Pryv S.A. https://pryv.com - All Rights Reserved
 * Unauthorized copying of this file, via any medium is strictly prohibited
 * Proprietary and confidential
 */
var fs = require('fs'),
    path = require('path'),
    _ = require('lodash'),
    args = process.argv.slice(2);

if (args.length < 1) {
  fail('Please specify a variables file (.js) to compile from.');
}

var varsFile = path.resolve(args[0]);
try {
  fs.accessSync(varsFile);
} catch (e) {
  fail('Cannot find file "' + varsFile + '".');
}

var dir = __dirname + '/../proxy',
    templateFile = path.resolve(dir, 'nginx.conf.template'),
    outputFile = path.resolve(dir, 'nginx.conf');

console.log('Compiling Nginx configuration from "' + varsFile + '" into "' + outputFile + '"...');

var output = _.template(fs.readFileSync(templateFile))({vars: require(varsFile)});
fs.writeFileSync(outputFile, output);

console.log('Done.');


function fail(message) {
  console.error(message);
  process.exit(1);
}

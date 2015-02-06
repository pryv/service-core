var output = module.exports = {};

var linePrefix = '  ';

output.print = function (string) {
  console.log(linePrefix + string.replace('\n', '\n' + linePrefix));
};

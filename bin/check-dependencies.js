var fs = require('fs'),
    path = require('path');
require('colors');

var deps = {};

var rootPackage = require(path.resolve(__dirname, '../package.json'));
checkDeps(rootPackage.dependencies, 'root (shared)');
checkDeps(rootPackage.devDependencies, 'root (shared)', 'dev');

var componentsPath = path.resolve(__dirname, '../components');
fs.readdirSync(componentsPath).forEach(function (name) {
  var packagePath = path.join(componentsPath, name, 'package.json');
  if (! fs.existsSync(packagePath)) {
    return;
  }
  var package = require(packagePath);
  checkDeps(package.dependencies, name);
  checkDeps(package.devDependencies, name, 'dev');
});

printDeps();

function checkDeps(dependenciesObj, requiringComponent, label) {
  if (dependenciesObj) {
    Object.keys(dependenciesObj).forEach(function (name) {
      countDep(name, dependenciesObj[name]);
    });
  }

  function countDep(name, version) {
    if (! deps[name]) {
      deps[name] = [];
    }
    deps[name].push(requiringComponent + (label ? ' [' + label + ']' : '') + ' —> ' + version);
  }
}

function printDeps() {
  Object.keys(deps).sort().forEach(function (name) {
    var warn = deps[name].length > 1;
    console.log((warn ? name.yellow.bold : name.green.dim) +
        (warn ? (' ∙ '.white + 'MULTIPLE DECLARATIONS'.yellow) : '') +
        '\n  ' + deps[name].join('\n  ')[warn ? 'white' : 'grey']);
  });
}

var fs = require('fs'),
    path = require('path');

var colors = false;
try {
  colors = require('colors');
} catch (e) {}

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
  var pkg = require(packagePath);
  checkDeps(pkg.dependencies, name);
  checkDeps(pkg.devDependencies, name, 'dev');
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
    var warn = deps[name].length > 1,
        pName = name,
        pWarn = warn ? ' ∙ multiple declarations' : '',
        pDeps = '\n  ' + deps[name].join('\n  ');
    if (colors) {
      pName = warn ? pName.yellow.bold : pName.green.dim;
      pWarn = pWarn.yellow;
      pDeps = warn ? pDeps : pDeps.grey;
    }
    console.log(pName + pWarn + pDeps);
  });
}

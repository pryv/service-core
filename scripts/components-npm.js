var fs = require('fs'),
    path = require('path'),
    childProcess = require('child_process');

var colors = false;
try {
  colors = require('colors');
} catch (e) {}

var componentsPath = path.resolve(__dirname, '../dist/components'),
    args = process.argv.slice(2);

if (args.length === 0) {
  console.error('npm command (like "install") required');
  process.exit(1);
}

var status = 0;
fs.readdirSync(componentsPath).forEach(function (name) {
  var subPath = path.join(componentsPath, name);
  if (! fs.existsSync(path.join(subPath, 'package.json'))) {
    return;
  }
  console.log(colors ? name.green : name);
  var res = childProcess.spawnSync('npm', args, {
    env: process.env,
    cwd: subPath,
    stdio: 'inherit'
  });
  status += res.status;
});

process.exit(status);

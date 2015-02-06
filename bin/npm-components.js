var fs = require('fs'),
    path = require('path'),
    childProcess = require('child_process');

var componentsPath = path.resolve(__dirname, '../components'),
    command = process.argv[2];

if (! command) {
  console.log('npm command (like "install") required');
  process.exit(1);
}

fs.readdirSync(componentsPath).forEach(function (name) {
  var subPath = path.join(componentsPath, name);
  if (! fs.existsSync(path.join(subPath, 'package.json'))) {
    return;
  }
  childProcess.spawn('npm', [command], {
    env: process.env,
    cwd: subPath,
    stdio: 'inherit'
  });
});

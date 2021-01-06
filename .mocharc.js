module.exports = {
  diff: true,
  extension: ['js'],
  opts: false,
  package: './package.json',
  reporter: 'spec',
  slow: 75,
  timeout: 2000,
  require: 'components/test-helpers/src/index2.js',
  ui: 'bdd',
  'watch-files': ['test/**/*.js']
};
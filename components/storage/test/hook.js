

Object.assign(global, {
  assert: require('chai').assert,
  bluebird: require('bluebird'),
  _: require('lodash'),
});
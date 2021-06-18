const _cache = {};

function getNameSpace(namespace) {
  return _cache[namespace] || ( _cache[namespace] = {} );
}

function set(namespace, key, value) {
  getNameSpace(namespace)[key] = value;
  return value;
}

function unset(namespace, key) {
  delete getNameSpace(namespace)[value];
}

function get(namespace, key) {
  return getNameSpace(namespace)[key];
}

module.exports = {
  set,
  unset,
  get
}
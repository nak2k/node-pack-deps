const { resolve } = require('path');

function resolveDeps(deps, base) {
  if (deps === undefined) {
    return undefined;
  }

  const result = Object.create(null);

  Object.entries(deps).forEach(([key, value]) => {
    if (value.startsWith('file:')) {
      value = 'file:' + resolve(base, value.substr(5));
    }

    result[key] = value;
  });

  return result;
}

/*
 * Exports.
 */
exports.resolveDeps = resolveDeps;

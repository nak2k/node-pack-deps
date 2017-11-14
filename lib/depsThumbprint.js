const { thumbprint } = require('json-thumbprint');
const { resolve } = require('path');

function depsThumbprint(options) {
  const {
    pkgJson,
    pkgDir,
    production,
    thumbprint: thumbprintOptions = {
      algorithm: 'sha1',
      encoding: 'hex',
    },
  } = options;

  const resolvedPkgJson = {
    bundledDependencies: resolveDeps(pkgJson.bundledDependencies, pkgDir),
    dependencies: resolveDeps(pkgJson.dependencies, pkgDir),
    devDependencies: production ? undefined : resolveDeps(pkgJson.devDependencies, pkgDir),
    optionalDependencies: resolveDeps(pkgJson.optionalDependencies, pkgDir),
    peerDependencies: resolveDeps(pkgJson.peerDependencies, pkgDir),
  };

  return {
    resolvedPkgJson,
    thumbprint: thumbprint(pkgJson, thumbprintOptions),
  };
}

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
exports.depsThumbprint = depsThumbprint;

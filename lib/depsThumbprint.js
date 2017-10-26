const { thumbprint } = require('json-thumbprint');
const { resolveDeps } = require('./resolveDeps');

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

  const json = {
    bundledDependencies: resolveDeps(pkgJson.bundledDependencies, pkgDir),
    dependencies: resolveDeps(pkgJson.dependencies, pkgDir),
    devDependencies: production ? undefined : resolveDeps(pkgJson.devDependencies, pkgDir),
    optionalDependencies: resolveDeps(pkgJson.optionalDependencies, pkgDir),
    peerDependencies: resolveDeps(pkgJson.peerDependencies, pkgDir),
  };

  return thumbprint(json, thumbprintOptions);
}

/*
 * Exports.
 */
exports.depsThumbprint = depsThumbprint;

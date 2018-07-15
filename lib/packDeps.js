const { readFile, createWriteStream, writeFile } = require('fs');
const JSZip = require('jszip');
const { depsThumbprint } = require('./depsThumbprint');
const path = require('path');
const mkdirp = require('mkdirp');
const npm = require('current-npm');
const waterfall = require('run-waterfall');
const { spawn } = require('child_process');
const { zipFiles } = require('jszip-glob');

/**
 * Pack dependencies.
 */
function packDeps(options, callback) {
  const {
    pkgJson,
    pkgDir,
    production,
    cacheBaseDir,
    compression = 'DEFLATE',
    compressionOptions = {
      level: 6,
    },
    exclude,
  } = options;

  const {
    resolvedPkgJson,
    thumbprint,
  } = depsThumbprint({
    pkgJson,
    pkgDir,
    production,
  });

  const cacheDir = path.join(cacheBaseDir, thumbprint);
  const cacheFile = path.join(cacheDir, thumbprint + '.zip');

  waterfall([
    /*
     * Find a cache.
     */
    readCache.bind(null, cacheFile),

    (zip, next) => {
      if (zip) {
        return callback(null, {
          cacheDir,
          cacheFile,
          thumbprint,
          zip,
        });
      }

      next(null);
    },

    /*
     * Prepare the cache dir.
     */
    mkdirp.bind(null, cacheDir),

    /*
     * Write the package.json.
     */
    (_, callback) =>
      writeFile(path.join(cacheDir, 'package.json'),
        JSON.stringify(
          Object.assign({
            name: thumbprint,
            private: true,
          }, resolvedPkgJson),
          null, 2),
        callback),

    /*
     * Install deps.
     */
    callback =>
      spawn('npm',
        production ? ['i', '--no-package-lock', '--production'] : ['i', '--no-package-lock'],
        {
          cwd: cacheDir,
          stdio: 'inherit',
          shell: true,
        })
        .on('exit', (code, signal) => {
          if (code === 0) {
            callback(null);
          } else {
            callback(new Error(`npm exited with code ${code}`));
          }
        }),

    /*
     * Pack deps into a zip file.
     */
    zipFiles.bind(null, 'node_modules/**', {
      cwd: cacheDir,
      dot: true,
      nodir: true,
      nosort: true,
      ignore: exclude,
      zip: new JSZip(),
      compression,
      compressionOptions,
    }),

    /*
     * Write a cache.
     */
    (zip, callback) => {
      zip.generateNodeStream({ streamFiles: true })
        .pipe(createWriteStream(cacheFile));

      /*
       * Return a JSZip instance.
       */
      callback(null, {
        cacheDir,
        cacheFile,
        thumbprint,
        zip,
      });
    },
  ], callback);
}

/*
 * Find a cache.
 */
function readCache(cacheFile, callback) {
  readFile(cacheFile, (err, data) => {
    /*
     * Return the found cache.
     */
    if (!err) {
      return JSZip.loadAsync(data)
        .then(zip => callback(null, zip))
        .catch(err => callback(err, null));
    }

    /*
     * Return an error when not a cache exists.
     */
    if (err.code !== 'ENOENT') {
      return callback(err, null);
    }

    /*
     * Not found.
     */
    callback(null, null);
  });
}

/*
 * Make arguments to run `npm install`.
 */
function makeInstallArgs(deps, base) {
  if (deps === undefined) {
    return [];
  }

  return Object.entries(deps).map(
    ([name, ver]) => ver.startsWith('file:')
      ? 'file:' + path.resolve(base, ver.substr(5))
      : `${name}@${ver}`
  );
}

/*
 * Exports.
 */
exports.packDeps = packDeps;

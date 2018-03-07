const { readFile, stat, createWriteStream, writeFile } = require('fs');
const JSZip = require('jszip');
const { depsThumbprint } = require('./depsThumbprint');
const path = require('path');
const mkdirp = require('mkdirp');
const npm = require('current-npm');
const glob = require('glob');
const parallel = require('run-parallel');
const waterfall = require('run-waterfall');
const { spawn } = require('child_process');

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
    packDepsIntoZip.bind(null, {
      cacheDir,
      compression,
      compressionOptions,
      exclude,
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
 * Pack deps into a zip file.
 */
function packDepsIntoZip(options, callback) {
  const {
    cacheDir,
    exclude,
  } = options;

  glob('node_modules/**', {
    cwd: cacheDir,
    dot: true,
    nodir: true,
    nosort: true,
    ignore: exclude,
  }, (err, files) => {
    if (err) {
      return callback(err);
    }

    const zip = new JSZip();

    const tasks = files.map(f =>
      addFileIntoZip.bind(null, f, zip, options));

    parallel(tasks, (err, result) => {
      if (err) {
        return callback(err);
      }

      callback(null, zip);
    });
  });
}

function addFileIntoZip(file, zip, options, callback) {
  const {
    cacheDir,
    compression,
    compressionOptions,
  } = options;

  stat(path.join(cacheDir, file), (err, stats) => {
    if (err) {
      return callback(err);
    }

    readFile(path.join(cacheDir, file), (err, data) => {
      if (err) {
        return callback(err);
      }

      zip.file(file, data, {
        mode: stats.mode,
        date: new Date(stats.mtime),
        compression,
        compressionOptions,
      });

      callback(null);
    });
  });
}

/*
 * Exports.
 */
exports.packDeps = packDeps;

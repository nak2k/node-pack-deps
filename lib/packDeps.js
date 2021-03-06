const { readFile, createWriteStream, unlink, writeFile } = require('fs');
const JSZip = require('jszip');
const { depsThumbprint } = require('./depsThumbprint');
const path = require('path');
const mkdirp = require('mkdirp');
const npm = require('current-npm');
const waterfall = require('run-waterfall');
const { zipFiles } = require('jszip-glob');
const { createHash } = require('crypto');

const debug = require('debug')('pack-deps');

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
    baseDirInZip,
    noCache,
  } = options;

  const {
    resolvedPkgJson,
    thumbprint,
  } = depsThumbprint({
    pkgJson,
    pkgDir,
    production,
  });

  const oldDir = process.cwd();

  const cacheDir = path.join(cacheBaseDir, thumbprint);
  const cacheFile = path.join(cacheDir, thumbprint + '.zip');
  const contextFile = path.join(cacheDir, 'context.json');

  const context = readContextFile(contextFile);

  debug('cache dir: %s', cacheDir);
  debug('previous context: %O', context);

  context.modifiedLocalPackages = [];

  waterfall([
    /*
     * Prepare.
     */
    callback =>
      mkdirp(cacheDir, err => {
        if (err) {
          return callback(err);
        }

        process.chdir(cacheDir);

        npm.load((err, npm) => callback(err));
      }),

    /*
     * Pack local packages.
     */
    packLocalPackages.bind(null, resolvedPkgJson.bundledDependencies, context),
    packLocalPackages.bind(null, resolvedPkgJson.dependencies, context),
    packLocalPackages.bind(null, resolvedPkgJson.devDependencies, context),
    packLocalPackages.bind(null, resolvedPkgJson.optionalDependencies, context),
    packLocalPackages.bind(null, resolvedPkgJson.peerDependencies, context),

    /*
     * Find a cache.
     */
    next => {
      process.chdir(oldDir);

      if (noCache) {
        return next(null);
      }

      if (context.modifiedLocalPackages.length) {
        debug('Cache is invalidated');

        return next(null);
      }

      readCache(cacheFile, (err, zip) => {
        if (err) {
          return next(err);
        }

        if (!zip) {
          debug('Cache not found');

          return next(null);
        }

        debug('Cache found');

        return callback(null, {
          cacheDir,
          cacheFile,
          thumbprint: context.thumbprint,
          zip,
        });
      });
    },

    /*
     * Write the package.json.
     */
    callback =>
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
    callback => {
      npm.config.set('production', production);
      npm.config.set('package-lock', false);

      npm.commands.install(cacheDir, [], err => callback(err));
    },

    /*
     * Reinstall modified local packages.
     */
    callback => {
      if (!context.modifiedLocalPackages.length) {
        return callback(null);
      }

      npm.config.set('force', true);

      npm.commands.install(cacheDir,
        context.modifiedLocalPackages.map(file => path.join(cacheDir, file)),
        err => callback(err));
    },

    /*
     * Pack deps into a zip file.
     */
    callback => {
      const zip = new JSZip();

      zipFiles('node_modules/**', {
        cwd: cacheDir,
        dot: true,
        nodir: true,
        nosort: true,
        ignore: exclude,
        zip: baseDirInZip ? zip.folder(baseDirInZip) : zip,
        compression,
        compressionOptions,
      }, err => {
        if (err) {
          return callback(err);
        }

        callback(null, zip);
      });
    },

    /*
     * Write a cache.
     */
    (zip, callback) => {
      if (noCache) {
        return callback(null, zip);
      }

      zip.generateNodeStream({ streamFiles: true })
        .pipe(createWriteStream(cacheFile));

      /*
       * Update thumbprint from local packages.
       */
      const localPackageList = Object.values(context.localPackages);

      if (localPackageList.length) {
        const md5 = createHash('md5');

        md5.update(thumbprint);

        localPackageList.forEach(({ integrity }) => md5.update(integrity));

        context.thumbprint = md5.digest('hex');
      } else {
        context.thumbprint = thumbprint;
      }

      /*
       * Write the context.
       */
      writeFile(contextFile, JSON.stringify(context, null, 2), err => {
        if (err) {
          return callback(err);
        }

        /*
         * Return a JSZip instance.
         */
        callback(null, zip);
      });
    },
  ], (err, zip) => {
    if (err) {
      return callback(err);
    }

    /*
     * Return the result.
     */
    callback(null, {
      cacheDir,
      cacheFile,
      thumbprint: context.thumbprint,
      zip,
    });
  });
}

function readContextFile(contextFile) {
  try {
    return require(contextFile);
  } catch (err) {
    return {
      localPackages: {
      },
    };
  }
}

function packLocalPackages(deps, context, callback) {
  if (!deps) {
    return callback(null);
  }

  const data = Object.entries(deps)
    .reduce((deps, [k, v]) => {
      if (v.startsWith('file:')) {
        deps.keys.push(k);
        deps.values.push(v.substr(5));
      }

      return deps;
    }, { keys: [], values: [] });

  if (!data.values.length) {
    return callback(null);
  }

  npm.commands.pack(data.values, false, (err, tarballs) => {
    if (err) {
      return callback(err);
    }

    data.keys.forEach((pkgName, index) => {
      const {
        filename,
        integrity,
      } = tarballs[index];

      deps[pkgName] = `file:./${filename}`;

      const prev = context.localPackages[pkgName];
      const integrityString = integrity.toString();

      if (!prev || prev.integrity !== integrityString) {
        context.localPackages[pkgName] = {
          integrity: integrityString,
        };
        context.modifiedLocalPackages.push(filename);
      }
    });

    callback(null);
  });
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

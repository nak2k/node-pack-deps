const test = require('tape');
const copy = require('recursive-copy');
const { packDeps } = require('..');

test('test packDeps with a local package', t => {
  t.plan(17);

  const src = __dirname + '/local-package';
  const dest = __dirname + '/tmp/local-package';

  copy(src, dest, { overwrite: true }, err => {
    t.error(err);

    if (err) { return; }

    const options = {
      pkgJson: {
        dependencies: {
          mkdirp: '> 0.4',
          'local-package': 'file:./tmp/local-package',
        },
      },
      pkgDir: __dirname,
      production: true,
      cacheBaseDir: __dirname + '/tmp',
    };

    packDeps(options, (err, result) => {
      t.error(err);

      if (err) { return; }

      t.equal(typeof(result.cacheDir), 'string');
      t.equal(typeof(result.cacheFile), 'string');

      const {
        thumbprint: thumbprintBefore,
        zip,
      } = result;

      t.equal(typeof(zip), 'object');
      t.equal(zip.file('node_modules/mkdirp/readme.markdown').name, 'node_modules/mkdirp/readme.markdown');

      const readmeFile = zip.file('node_modules/local-package/README.md');
      t.equal(readmeFile.name, 'node_modules/local-package/README.md');

      readmeFile.async('text')
        .then(text => {
          t.ok(!text.match(/test/));
        });

      /*
       * Test packDeps after the local package is modified.
       */
      const src = __dirname + '/local-package2';

      copy(src, dest, { overwrite: true }, err => {
        t.error(err);

        if (err) { return; }

        packDeps(options, (err, result) => {
          t.error(err);

          if (err) { return; }

          t.equal(typeof(result.cacheDir), 'string');
          t.equal(typeof(result.cacheFile), 'string');

          const {
            thumbprint: thumbprintAfter,
            zip,
          } = result;

          t.equal(typeof(zip), 'object');
          t.equal(zip.file('node_modules/mkdirp/readme.markdown').name, 'node_modules/mkdirp/readme.markdown');

          const readmeFile = zip.file('node_modules/local-package/README.md');
          t.equal(readmeFile.name, 'node_modules/local-package/README.md');

          t.notEqual(thumbprintAfter, thumbprintBefore);

          readmeFile.async('text')
            .then(text => {
              t.ok(text.match(/test/));
            });
        });
      });
    });
  });
});

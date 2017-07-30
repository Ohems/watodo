import fs from 'fs';
import browserify from 'browserify';
import watchify from 'watchify';
import less from 'less';
import glob from 'glob';

import config from './config';

const { info, error } = require('./utils/logger')(__filename);

const production = config.NODE_ENV === 'production';

const bundle = browserify('./public/scripts/main.js', {
  debug: !production,
  plugin: [watchify],
});

if (production) {
  bundle.transform({ global: true }, 'uglifyify');
}

bundle.transform('babelify', {
  presets: ['es2015', 'react'],
});

bundle.transform('browserify-css', {
  autoInject: true,
  minify: production,
});


info('Building scripts...');
bundle.bundle()
  .on('close', () => info('Scripts built'))
  .on('error', function handleError(err) {
    error(err);
    this.emit('end'); // end this stream
  })
  .pipe(fs.createWriteStream('./public/build/bundle.js'));

info('Building styles...');
glob('./public/styles/**/*.less', (er, files) => {
  const styleBundle = files.reduce((styles, file) => styles + fs.readFileSync(file), '');

  less.render(
    styleBundle,
    { compress: true },
    (e, output) => {
      if (e) {
        warn(`Styles failed: ${e.stack}`);
        return;
      }

      fs.writeFileSync('./public/build/styles.css', output.css, 'utf-8');
      info('Styles built');
    }
  );
});

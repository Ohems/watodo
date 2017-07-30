const gulp = require('gulp');
const gutil = require('gulp-util');
const browserify = require('browserify');
const watchify = require('watchify');
const concat = require('gulp-concat');
const uglify = require('gulp-uglify');
const sourcemaps = require('gulp-sourcemaps');
const less = require('gulp-less');
const minifyCSS = require('gulp-csso');
const source = require('vinyl-source-stream');
const buffer = require('vinyl-buffer');
const del = require('del');
const fs = require('fs');
const nodemon = require('nodemon');
const assign = require('lodash').assign;

const { info } = require('./backend/utils/logger')(__filename);
const config = require('./backend/config');

const production = config.NODE_ENV === 'production';

const babelConfig = JSON.parse(fs.readFileSync('./.babelrc'));

const paths = {
  scripts: ['public/scripts/**/*.js'],
  css: ['public/styles/**/*.less'],
};

const browserifyOpts = {
  entries: ['./public/scripts/main.js'],
  debug: !production,
};

const opts = assign({}, watchify.args, browserifyOpts);
const b = watchify(browserify(opts));

b.transform('babelify', babelConfig);

b.transform(
  { global: true },
  'browserify-css',
  {
    minify: production,
    inlineImages: true,
  }
);

gulp.task('scripts', bundle);
b.on('update', bundle);
b.on('log', gutil.log);

function bundle() {
  return b.bundle()
    // log errors if they happen
    .on('error', gutil.log.bind(gutil, 'Browserify Error'))
    .pipe(source('bundle.js'))
    // optional, remove if you don't need to buffer file contents
    .pipe(buffer())
    // loads map from browserify file
    .pipe(sourcemaps.init({ loadMaps: true }))
    .pipe(uglify())
    .pipe(sourcemaps.write('./')) // writes .map file
    .pipe(gulp.dest('./public/build'));
}

gulp.task('css', () =>
  gulp.src(paths.css)
    .pipe(concat('styles.js'))
    .pipe(less())
    .pipe(minifyCSS())
    .pipe(gulp.dest('public/build'))
);

// Rerun the task when a file changes
gulp.task('watch', () => {
  gulp.watch(paths.scripts, ['scripts']);
  gulp.watch(paths.css, ['css']);
});

gulp.task('server', () => {
  // configure nodemon
  nodemon({
    script: 'backend/entry.js',
    watch: ['backend/**/*.js'],
    ext: 'js',
  }).on('restart', () => {
    info('Changes detected, restarting server');
    gulp.src('server.js');
  });
});

gulp.task('clean', () =>
  del(['public/build'])
);

// The default task (called when you run `gulp` from cli)
gulp.task('default', ['watch', 'scripts', 'css', 'server']);

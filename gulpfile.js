const argv = require('yargs').argv;
const cache = require('gulp-cached');
const gulp = require('gulp');
const gulp_rename = require('gulp-rename');
const gulp_watch = require('gulp-watch');
const ts = require('gulp-typescript');
const vinyl_source = require('vinyl-source-stream');

const ts_project = ts.createProject('tsconfig.json', {
  isolatedModules: !argv.c,
  declaration: true
});

const rename = (next_path) => {
  const split = next_path.dirname.split('/');
  const len = split.length - (next_path.dirname.endsWith('test') ? 2 : 1);
  split.splice(0,len);
  next_path.dirname = split.join('/');
};

const handle_typescript_files = () => {
  return gulp.src([`./src/**/*.ts`])
      .pipe(cache())
      .pipe(ts_project())
      .pipe(gulp_rename(rename))
      .pipe(gulp.dest('./dist'));
};

const handle_other_files = () => {
  return gulp.src([`./src/**/*.*`, `!./src/**/*.ts`])
    .pipe(cache())
    .pipe(gulp_rename(rename))
    .pipe(gulp.dest('./dist'));
};

gulp.task('default', [ 'watch-src' ]);

gulp.task('watch-src', async () => {
  await new Promise(() => {
    gulp_watch(`./src/**/*.*`, () => gulp.start('flatten-src'));
    gulp.start('flatten-src');
  });
});

gulp.task('flatten-src', async () => {
  await new Promise(resolve => {
    handle_typescript_files()
        .on('finish', handle_other_files)
        .on('finish', () => {
      resolve();
    });
  });
});

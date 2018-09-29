const argv = require('yargs').argv;
const cache = require('gulp-cached');
const gulp = require('gulp');
const gulp_rename = require('gulp-rename');
const gulp_watch = require('gulp-watch');
const ts = require('gulp-typescript');
const vinyl_source = require('vinyl-source-stream');
const exec = require('child_process').exec;

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

gulp.task('regen-gce', async () => {
  const cmd = `gcloud compute machine-types list --format=json`;
  await new Promise((resolve, reject) => {
    exec(cmd, { maxBuffer: 1024 * 100000 }, (err, stdout) => {
      if (err) {
        reject(err);
      } else {
        const mtypes_arr = JSON.parse(stdout);
        const mtypes = {};
        const mtypes_atoz = {};
        const regions = {};

        mtypes_arr.forEach(mtype => mtypes[mtype.zone] = []);
        mtypes_arr.forEach(mtype => mtypes[mtype.zone].push(mtype.name));

        for (const zone in mtypes) {
          mtypes[zone] = mtypes[zone].sort();
        }

        Object.keys(mtypes).sort().forEach(zone => mtypes_atoz[zone] = mtypes[zone]);

        Object.keys(mtypes_atoz)
            .forEach(zone => regions[zone.slice(0, -2)] = zone.slice(0, 1));

        console.log('');
        console.log(JSON.stringify(mtypes_atoz,null,2));
        console.log('');
        console.log(JSON.stringify(Object.keys(mtypes_atoz),null,2));
        console.log('');
        console.log(JSON.stringify(regions,null,2));
        console.log('');
        resolve();
      }
    });
  });
});

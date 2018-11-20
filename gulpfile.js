const argv = require('yargs').argv;
const cache = require('gulp-cached');
const gulp = require('gulp');
const gulp_watch = require('gulp-watch');
const ts = require('gulp-typescript');
const exec = require('child_process').exec;

const ts_project = ts.createProject('tsconfig.json', {
  isolatedModules: !argv.c
});

gulp.task('default', [ 'watch' ]);

gulp.task('watch', async () => {
  await new Promise(() => {
    gulp_watch([ 'src/**/*.*' ], () => gulp.start('flatten'));
    gulp.start('flatten');
  });
});

gulp.task('flatten', async () => {
  await handle_ts_files();
  await handle_other_files();
});

const handle_ts_files = async () => {
  await new Promise(res => {
    ts_project.src()
        .pipe(cache())
        .pipe(ts_project())
        .pipe(gulp.dest('dist'))
        .on('finish', res);
  });
};

const handle_other_files = async () => {
  await new Promise(res => {
    gulp.src([
      `src/**/*`,
      `!src/**/*.ts`
    ]).pipe(cache())
      .pipe(gulp.dest(`dist/src`))
      .on('finish', res);
  });
};

gulp.task('gce', async () => {
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

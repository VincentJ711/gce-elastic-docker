import { registries } from '../gce';
import { Utils } from '../utils';

const kibana_users_env_var = 'kibana_users';
const kibana_password_dir = '/kibana-users';
const kibana_password_file = `${kibana_password_dir}/.htpasswd`;
const kibana_password_set_file = `${kibana_password_dir}/.passwords-were-set`;

export {
  kibana_users_env_var,
  kibana_password_dir,
  kibana_password_file
};

export interface IImage {
  es_version: string;
  kibana?: boolean;
  name: string;
}

export class Image implements IImage {
  es_version: string;
  kibana: boolean;
  name: string;
  private _es_dockerfile: string;
  private _kib_dockerfile: string;

  constructor(v: IImage) {
    this._set_es_version(v);
    this._set_kibana(v);
    this._set_name(v);
    this._create_es_dockerfile();
    this._create_kib_dockerfile();
  }

  async create(verbose?: boolean) {
    const dockerfile = this.kibana ? this._kib_dockerfile : this._es_dockerfile;
    const cmd = `docker build -t ${this.name} . -f-<<EOF\n${dockerfile}\nEOF`;
    const cwd = process.cwd();

    if (verbose) {
      console.log(`creating image ${this.name} from the following dockerfile:\n`);
      console.log(dockerfile + '\n');
    }

    // docker build requires u be in the directory u copy files from...
    process.chdir(__dirname);
    await Utils.exec(cmd, verbose);
    process.chdir(cwd);

    if (verbose) {
      console.log(`\nimage ${this.name} created!`);
    }
  }

  async deploy(verbose?: boolean) {
    const cmd = `docker push ${this.name}`;

    if (verbose) {
      console.log(`deploying ${this.name} to your google container registry`);
      console.log(cmd);
    }

    await Utils.exec(cmd, verbose);
  }

  private _create_es_dockerfile() {
    const startup_file = 'startup.sh';

    this._es_dockerfile =
        `FROM docker.elastic.co/elasticsearch/elasticsearch:${this.es_version}\n` +
        'WORKDIR /usr/share\n' +
        `RUN echo '#! /bin/bash' >> ${startup_file}\n` +
        `RUN echo 'ulimit -l unlimited' >> ${startup_file}\n` +
        `RUN echo '/usr/local/bin/docker-entrypoint.sh eswrapper' >> ${startup_file}\n` +
        `RUN chmod 777 ${startup_file}\n` +
        `ENTRYPOINT ./${startup_file}`;
  }

  private _create_kib_dockerfile() {
    const kurl = 'https://artifacts.elastic.co/downloads/kibana/kibana';
    const startup_file = 'startup.sh';
    const pfile = kibana_password_file;
    const kenv = kibana_users_env_var;
    const cmd = 'nginx & /usr/share/kibana/bin/kibana --server.host=0.0.0.0 ' +
        '& /usr/local/bin/docker-entrypoint.sh eswrapper ';
    const psetfile = kibana_password_set_file;
    const psetfile_msg = 'This file indicates to the startup script your initial ' +
        'kibana users have been set. If you delete this, the next time the ' +
        'startup script runs, your kibana users will be reset to the original ' +
        'ones you gave on cluster creation.';
    const nginx_key_file = '/etc/nginx/ssl.key';
    const nginx_cert_file = '/etc/nginx/ssl.cert';

    this._kib_dockerfile =
        `FROM docker.elastic.co/elasticsearch/elasticsearch:${this.es_version}\n` +
        'WORKDIR /usr/share\n' +
        `RUN wget -q ${kurl}-${this.es_version}-x86_64.rpm\n` +
        `RUN rpm --install kibana-${this.es_version}-x86_64.rpm\n` +
        'RUN yum install -y epel-release\n' +
        'RUN yum install -y nginx\n' +
        'RUN yum install -y httpd-tools\n' +
        `RUN mkdir ${kibana_password_dir}\n` +

        // handle nginx config
        'COPY nginx.conf /etc/nginx/nginx.conf\n' +
        'RUN openssl req -new -newkey rsa:4096 -days 365 -nodes -x509 ' +
            '-subj "/C=US/ST=Denial/L=Springfield/O=Dis/CN=www.example.com" ' +
            `-keyout ${nginx_key_file} -out ${nginx_cert_file}\n` +
        `RUN sed -i 's|~~pfile~~|'${pfile}'|g' /etc/nginx/nginx.conf\n` +
        `RUN sed -i 's|~~keyfile~~|'${nginx_key_file}'|g' /etc/nginx/nginx.conf\n` +
        `RUN sed -i 's|~~certfile~~|'${nginx_cert_file}'|g' /etc/nginx/nginx.conf\n` +

        // handle startup script file
        `RUN echo '#! /bin/bash' >> ${startup_file}\n` +
        `RUN echo 'if [ -n "\\$${kenv}" ] && [ ! -f ${psetfile} ]; then' >> ${startup_file}\n` +
        `RUN echo '  k=\\$(echo \\$${kenv} | base64 --decode);' >> ${startup_file}\n` +
        `RUN echo '  IFS=" " read -r -a array <<< "\\$k";' >> ${startup_file}\n` +
        `RUN echo '  printf "%s\\n" "\\$\{array[@]}" > ${pfile};' >> ${startup_file}\n` +
        `RUN echo '  printf "${psetfile_msg}" > ${psetfile};' >> ${startup_file}\n` +
        `RUN echo 'fi' >> ${startup_file}\n` +
        `RUN echo 'ulimit -l unlimited' >> ${startup_file}\n` +
        `RUN echo '${cmd}' >> ${startup_file}\n` +
        `RUN chmod 777 ${startup_file}\n` +
        `ENTRYPOINT ./${startup_file}`;
  }

  private _set_es_version(v: IImage) {
    if (!/\d+.\d+.\d+/.test(v.es_version)) {
      throw Error(`${v} is an invalid version.`);
    }
    this.es_version = v.es_version;
  }

  private _set_kibana(v: IImage) {
    if (Utils.is_defined(v.kibana) && !Utils.is_bool(v.kibana)) {
      throw Error('not a boolean.');
    }
    this.kibana = !!v.kibana;
  }

  private _set_name(v: IImage) {
    if (!Utils.is_valid_image_name(v.name)) {
      throw Error(`${v.name} is an invalid image name. Make sure it looks like: ` +
          `{${registries.join(' | ')}}/{gcloud-project-id}/{image_name}`);
    }
    this.name = v.name;
  }
}

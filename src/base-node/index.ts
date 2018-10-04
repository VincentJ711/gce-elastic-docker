import { m_types, registries, short_regions, zones } from '../gce';
import { kibana_users_env_var } from '../image';
import { Utils } from '../utils';

const ged_label = 'ged';

export { ged_label };

export interface IReservedEnv {
  [kibana_users_env_var]: any;
  [ged_label]: any;
  'bootstrap.memory_lock': any;
  'cluster.name': any;
  'ES_JAVA_OPTS': any;
  'network.host': any;
  'node.data': any;
  'node.ingest': any;
  'node.master': any;
  'node.name': any;
  'NODE_OPTIONS': any;
}

export interface IReservedLabels {
  [ged_label]: any;
}

export interface IBaseNode {
  cluster_name: string;
  data?: boolean;
  dsize: number;
  dtype: 'pd-standard' | 'pd-ssd';
  env?: {};
  hsize: number;
  image: string;
  ingest?: boolean;
  khsize?: number;
  kibana?: boolean;
  labels?: {};
  master?: boolean;
  max_map_count?: number;
  mtype: string;
  name: string;
  region?: string;
  service_account: string;
  short_region?: string;
  zone: string;
}

export class BaseNode implements IBaseNode {
  cluster_name: string;
  data: boolean;
  dsize: number;
  dtype: 'pd-standard' | 'pd-ssd';
  env: {};
  hsize: number;
  image: string;
  ingest: boolean;
  khsize: number;
  kibana: boolean;
  labels: {};
  master: boolean;
  max_map_count: number;
  mtype: string;
  name: string;
  region: string;
  service_account: string;
  short_region: string;
  zone: string;

  constructor(v: IBaseNode) {
    this._set_cluster_name(v);
    this._set_data(v);
    this._set_dsize(v);
    this._set_dtype(v);

    this.env = {};
    this.set_env(v.env);

    this.set_hsize(v.hsize);
    this.set_khsize(v.khsize);
    this._set_image(v);
    this._set_ingest(v);
    this._set_kibana(v);
    this._set_labels(v.labels);
    this._set_master(v);
    this._set_max_map_count(v);
    this._set_zone(v); // must set zone b4 mtype.
    this._set_mtype(v);
    this._set_name(v);
    this._set_service_account(v);
    this.region = this.zone.slice(0, -2);
    this.short_region = short_regions[this.region];
  }

  // returns the keys of all env vars to remove aka that are null.
  get_env_to_remove(): string[] {
    return Object.keys(this.env).filter(e => this.env[e] === null);
  }

  // returns all creatable or updatable env keys/values
  get_merged_env(): { [key: string]: any } {
    const copy: BaseNode = JSON.parse(JSON.stringify(this));

    // remove keys set to null from the copies env.
    for (const k in copy.env) {
      if (copy.env[k] === null) {
        delete copy.env[k];
      }
    }

    const base: IReservedEnv = {
      ES_JAVA_OPTS: `-Xms${this.hsize}m -Xmx${this.hsize}m`,
      NODE_OPTIONS: `--max-old-space-size=${this.khsize}`,
      'bootstrap.memory_lock': true,
      'cluster.name': this.cluster_name,
      ged: Buffer.from(JSON.stringify(copy)).toString('base64'),
      kibana_users: undefined, // set when creating a node.
      'network.host': '0.0.0.0',
      'node.data': this.data,
      'node.ingest': this.ingest,
      'node.master': this.master,
      'node.name': this.name
    };

    delete base[kibana_users_env_var];
    Object.keys(copy.env).forEach(k => base[k] = `${copy.env[k]}`);
    return base;
  }

  get_merged_labels(): { [key: string]: any } {
    const base: IReservedLabels = {
      ged: 'true'
    };

    Object.keys(this.labels).forEach(k => base[k] = this.labels[k]);
    return base;
  }

  set_env(v?: {}) {
    const reserved: IReservedEnv = {
      ES_JAVA_OPTS: true,
      NODE_OPTIONS: true,
      'bootstrap.memory_lock': true,
      'cluster.name': true,
      ged: true,
      kibana_users: true,
      'network.host': true,
      'node.data': true,
      'node.ingest': true,
      'node.master': true,
      'node.name': true
    };

    if (v) {
      Object.keys(v).map(k => {
        if (!Utils.is_string(v[k]) && !Utils.is_null(v[k]) &&
            !Utils.is_number(v[k]) && !Utils.is_bool(v[k])) {
          throw Error('an environment value must be a string|null|number|bool.');
        } else if (reserved[k]) {
          throw Error(`${k} is a reserved env variable this package sets.`);
        } else {
          this.env[k] = v[k];
        }
      });
    }
  }

  set_hsize(v: number) {
    if (!Utils.is_integer(v) || (v < 100) || (v > 31000)) {
      throw Error(`es heap size of ${v} must be an integer from [100, 31000]`);
    }
    this.hsize = v;
  }

  set_khsize(v?: number) {
    const val: any = v;
    if (Utils.is_defined(val)) {
      if (!Utils.is_integer(val)) {
        throw Error('kibana heap size not an integer');
      } else if (val < 100) {
        throw Error('kibana heap size too small.');
      }
    }
    this.khsize = val ? val : 512;
  }

  private _set_cluster_name(v: IBaseNode) {
    if (!Utils.is_string(v.cluster_name) || !v.cluster_name || / /.test(v.cluster_name)) {
      throw Error(`${v.cluster_name} is not a valid cluster name`);
    }
    this.cluster_name = v.cluster_name;
  }

  private _set_data(v: IBaseNode) {
    if (Utils.is_bool(v.data)) {
      this.data = <boolean> v.data;
    } else if (Utils.is_defined(v.data)) {
      throw Error('not a boolean');
    } else {
      this.data = true;
    }
  }

  private _set_dsize(v: IBaseNode) {
    if (!Utils.is_integer(v.dsize) || (v.dsize < 10) || (v.dsize > 6400)) {
      throw Error(`disk size of ${v.dsize} must be an integer from [10, 6400]`);
    }
    this.dsize = v.dsize;
  }

  private _set_dtype(v: IBaseNode) {
    if ((v.dtype !== 'pd-ssd') && v.dtype !== ('pd-standard')) {
      throw Error('disk type must be pd-ssd|pd-standard');
    }
    this.dtype = v.dtype;
  }

  private _set_image(v: IBaseNode) {
    if (!Utils.is_valid_image_name(v.image)) {
      throw Error(`${v.image} is an invalid image name. Make sure it looks like: ` +
          `{${registries.join(' | ')}}/{gcloud-project-id}/{image_name}`);
    }
    this.image = v.image;
  }

  private _set_ingest(v: IBaseNode) {
    if (Utils.is_bool(v.ingest)) {
      this.ingest = <boolean> v.ingest;
    } else if (Utils.is_defined(v.ingest)) {
      throw Error('not a boolean');
    } else {
      this.ingest = false;
    }
  }

  private _set_kibana(v: IBaseNode) {
    if (Utils.is_bool(v.kibana)) {
      this.kibana = <boolean> v.kibana;
    } else if (Utils.is_defined(v.kibana)) {
      throw Error('not a boolean');
    } else {
      this.kibana = false;
    }
  }

  private _set_labels(v?: {}) {
    const reserved: IReservedLabels = {
      ged: true
    };

    this.labels = {};

    if (v) {
      Object.keys(v).map(k => {
        if (!Utils.is_string(v[k]) || !v[k]) {
          throw Error('a labels value must be a nonempty string.');
        } else if (!/^[a-z]/.test(k)) {
          throw Error('a label must start with lowercase letter.');
        } else if (!/^[a-z0-9_-]*$/.test(k)) {
          throw Error('a label can contain only a-z0-9_-');
        } else if (!/^[a-z0-9_-]*$/.test(v[k])) {
          throw Error('a labels value can contain only a-z0-9_-');
        } else if (reserved[k]) {
          throw Error(`${k} is a reserved label this package sets.`);
        } else {
          this.labels[k] = v[k];
        }
      });
    }
  }

  private _set_master(v: IBaseNode) {
    if (Utils.is_bool(v.master)) {
      this.master = <boolean> v.master;
    } else if (Utils.is_defined(v.master)) {
      throw Error('not a boolean');
    } else {
      this.master = true;
    }
  }

  private _set_max_map_count(v: IBaseNode) {
    if (Utils.is_defined(v.max_map_count) && (!Utils.is_integer(v.max_map_count) ||
        (<number> v.max_map_count <= 0))) {
      throw Error('max map count must be an integer > 0');
    }
    this.max_map_count = v.max_map_count ? v.max_map_count : 262144;
  }

  private _set_mtype(v: IBaseNode) {
    if (m_types[this.zone].indexOf(v.mtype) === -1) {
      throw Error(`mtype of ${v.mtype} is an invalid gce machine ` +
          `type for zone ${this.zone}`);
    }
    this.mtype = v.mtype;
  }

  private _set_name(v: IBaseNode) {
    if (!Utils.is_string(v.name) || !v.name || / /.test(v.name)) {
      throw Error(`${v.name} is not a valid name.`);
    }
    this.name = v.name;
  }

  private _set_service_account(v: IBaseNode) {
    if (!Utils.is_string(v.service_account) || !/compute@developer/.test(v.service_account)) {
      throw Error('must provide a valid default gce service account.');
    }
    this.service_account = v.service_account;
  }

  private _set_zone(v: IBaseNode) {
    if (zones.indexOf(v.zone) === -1) {
      throw Error(`${v} is an invalid gce zone.`);
    }
    this.zone = v.zone;
  }
}

import * as md5 from 'apache-md5';
import { Utils } from '../utils';

export interface IElasticScript {
  lang: string;
  source: string;
}

export interface INodeCreateOpts {
  interval?: number;
  kibana_network_tag?: string;
  kibana_users?: { [username: string]: string };
  scripts?: { [name: string]: IElasticScript };
  sm?: object;
  verbose?: boolean;
}

export class NodeCreateOpts implements INodeCreateOpts {
  interval: number;
  kibana_network_tag?: string;
  kibana_users: { [username: string]: string };
  scripts: { [name: string]: IElasticScript };
  sm: object;
  verbose: boolean;

  constructor(v: INodeCreateOpts) {
    this._set_interval(v);
    this._set_kibana_network_tag(v);
    this._set_kibana_users(v);
    this._set_scripts(v);
    this._set_sm(v);
    this._set_verbose(v);
  }

  get_kibana_users_env_value() {
    const usernames = Object.keys(this.kibana_users);
    if (usernames.length) {
      const tokens = usernames.map(username => {
        const pass = this.kibana_users[username];
        const hash = md5(pass);
        return `${username}:${hash}`;
      });
      return Buffer.from(tokens.join(' ')).toString('base64');
    }
  }

  private _set_interval(v: INodeCreateOpts) {
    if (Utils.is_defined(v.interval) &&
        (!Utils.is_number(v.interval) || (<number> v.interval < 1000))) {
      throw Error('interval must be >= 1000');
    }
    this.interval = v.interval ? v.interval : 2000;
  }

  private _set_kibana_network_tag(v: INodeCreateOpts) {
    if (v.kibana_network_tag && (!Utils.is_string(v.kibana_network_tag) ||
        !v.kibana_network_tag || / /.test(v.kibana_network_tag))) {
      throw Error(`${v.kibana_network_tag} is not a valid name for a gce network tag.`);
    } else if (v.kibana_network_tag) {
      this.kibana_network_tag = v.kibana_network_tag;
    }
  }

  private _set_kibana_users(v: INodeCreateOpts) {
    this.kibana_users = {};
    if (v.kibana_users) {
      for (const username in v.kibana_users) {
        const pass = v.kibana_users[username];

        if (!username || (username.length > 255)) {
          throw Error('username must be a string <= 255 characters. see apache htpasswd.');
        } else if (!Utils.is_string(pass) || !pass || (pass.length > 255)) {
          throw Error('password must be a string <= 255 characters. see apache htpasswd.');
        }

        this.kibana_users[username] = pass;
      }
    }
  }

  private _set_scripts(v: INodeCreateOpts) {
    if (Utils.is_object(v.scripts)) {
      this.scripts = <{}> v.scripts;
    } else if (Utils.is_defined(v.scripts)) {
      throw Error('scripts must be an object.');
    } else {
      this.scripts = {};
    }
  }

  private _set_sm(v: INodeCreateOpts) {
    if (Utils.is_object(v.sm)) {
      this.sm = <object> v.sm;
    } else if (Utils.is_defined(v.sm)) {
      throw Error('settings and mappings must be an object.');
    } else {
      this.sm = {};
    }
  }

  private _set_verbose(v: INodeCreateOpts) {
    this.verbose = !!v.verbose;
  }
}

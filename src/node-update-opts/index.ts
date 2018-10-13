import { IElasticScript } from '../node-create-opts';
import { Utils } from '../utils';

export interface INodeUpdateOpts {
  interval?: number;
  kso?: any[];
  scripts?: { [name: string]: IElasticScript };
  sm?: object;
  verbose?: boolean;
}

export class NodeUpdateOpts implements INodeUpdateOpts {
  interval: number;
  kso: any[];
  scripts: { [name: string]: IElasticScript };
  sm: object;
  verbose: boolean;

  constructor(v: INodeUpdateOpts) {
    const o = v || {};
    this._set_interval(o);
    this._set_kso(o);
    this._set_scripts(o);
    this._set_sm(o);
    this._set_verbose(o);
  }

  private _set_interval(v: INodeUpdateOpts) {
    if (Utils.is_defined(v.interval) &&
        (!Utils.is_number(v.interval) || (<number> v.interval < 1000))) {
      throw Error('interval must be >= 1000');
    }
    this.interval = v.interval ? v.interval : 2000;
  }

  private _set_kso(v: INodeUpdateOpts) {
    if (Utils.is_array(v.kso)) {
      this.kso = <[]> v.kso;
    } else if (Utils.is_defined(v.kso)) {
      throw Error('kibana saved objects must be an array.');
    } else {
      this.kso = [];
    }
  }

  private _set_scripts(v: INodeUpdateOpts) {
    if (Utils.is_defined(v.scripts) && Utils.is_object(v.scripts)) {
      this.scripts = <{}> v.scripts;
    } else if (Utils.is_defined(v.scripts)) {
      throw Error('scripts must be an object.');
    } else {
      this.scripts = {};
    }
  }

  private _set_sm(v: INodeUpdateOpts) {
    if (Utils.is_defined(v.sm) && Utils.is_object(v.sm)) {
      this.sm = <object> v.sm;
    } else if (Utils.is_defined(v.sm)) {
      throw Error('settings and mappings must be an object.');
    } else {
      this.sm = {};
    }
  }

  private _set_verbose(v: INodeUpdateOpts) {
    this.verbose = !!v.verbose;
  }
}

import { IElasticScript } from '../node-create-opts';
import { Utils } from '../utils';

export interface INodeUpdateOpts {
  interval?: number;
  scripts?: { [name: string]: IElasticScript };
  sm?: object;
  verbose?: boolean;
}

export class NodeUpdateOpts implements INodeUpdateOpts {
  interval: number;
  scripts: { [name: string]: IElasticScript };
  sm: object;
  verbose: boolean;

  constructor(v: INodeUpdateOpts) {
    if (Utils.is_defined(v)) {
      this._set_interval(v);
      this._set_scripts(v);
      this._set_sm(v);
      this._set_verbose(v);
    }
  }

  private _set_interval(v: INodeUpdateOpts) {
    if (Utils.is_defined(v.interval) &&
        (!Utils.is_number(v.interval) || (<number> v.interval < 1000))) {
      throw Error('interval must be >= 1000');
    }
    this.interval = v.interval ? v.interval : 2000;
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

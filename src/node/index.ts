import { safeLoad } from 'js-yaml';
import { BaseNode, ged_label, IBaseNode } from '../base-node';
import { INodeUpdateOpts, NodeUpdateOpts } from '../node-update-opts';
import { NodeUpdater } from '../node-updater';
import { Utils } from '../utils';

export interface INode extends IBaseNode {
  created: number;
  ip: string;
}

export class Node extends BaseNode implements INode {
  static async fetch_all(verbose?: boolean) {
    const cmd = 'gcloud compute instances list --format=json ' +
        `--filter="labels:${ged_label}"`;

    if (verbose) {
      console.log(`fetching all nodes this package has created via\n${cmd}`);
    }

    const vms: any[] = JSON.parse(<string> await Utils.exec(cmd, verbose));
    const ret: any[] = [];

    vms.forEach(vm => {
      // get the internal ip/create time
      const ip = vm.networkInterfaces[0].networkIP;
      const created = (new Date(vm.creationTimestamp)).valueOf();

      vm.metadata.items.forEach(m => {
        if (m.key === 'gce-container-declaration') {
          const container_decl = safeLoad(m.value);
          const envs = container_decl.spec.containers[0].env;
          const envb64 = envs.filter(e => e.name === ged_label)[0].value;
          const env = Buffer.from(envb64, 'base64').toString();
          const tmp_node: INode = JSON.parse(env);

          tmp_node.ip = ip;
          tmp_node.created = created;

          // will throw if internal ip/created are not yet set  so disregard
          // those nodes. this will occur only when they are being created.
          try {
            ret.push(new Node(tmp_node));
          } catch (e) {}
        }
      });
    });

    return ret;
  }

  created: number;
  ip: string;

  constructor(v: INode) {
    super(v);
    this._set_created(v);
    this._set_ip(v);
  }

  // command should be wrapped in "" | ''. let the user decide.
  async curl(cmd: string, verbose?: boolean) {
    if (!Utils.is_string(cmd) || !cmd) {
      throw Error('command missing!');
    }

    const wrapped_cmd = `gcloud compute ssh ${this.name} --zone ${this.zone} --command ${cmd}`;

    if (verbose) {
      console.log(`executing: ${wrapped_cmd}`);
    }

    await Utils.exec(wrapped_cmd, verbose);
  }

  async delete(verbose?: boolean) {
    const cmd = `printf "y\n" | gcloud compute instances delete ${this.name} --zone ${this.zone}`;

    if (verbose) {
      console.log(`deleting instance ${this.name} via ${cmd}`);
    }

    await Utils.exec(cmd, verbose);
  }

  async restart(verbose?: boolean) {
    await this.stop(verbose);
    await this.start(verbose);
  }

  async start(verbose?: boolean) {
    const cmd = `gcloud compute instances start ${this.name} --zone ${this.zone}`;

    if (verbose) {
      console.log(`starting instance ${this.name} via ${cmd}`);
    }

    await Utils.exec(cmd, verbose);
  }

  async stop(verbose?: boolean) {
    const cmd = `gcloud compute instances stop ${this.name} --zone ${this.zone}`;

    if (verbose) {
      console.log(`stopping instance ${this.name} via ${cmd}`);
    }

    await Utils.exec(cmd, verbose);
  }

  update(opts: INodeUpdateOpts) {
    return (new NodeUpdater(this, new NodeUpdateOpts(opts))).update();
  }

  async wait_for_elastic(interval: number, verbose?: boolean) {
    const cmd = `gcloud compute ssh ${this.name} --zone ${this.zone} ` +
        '--command "curl -s localhost:9200/_cluster/health"';

    if (verbose) {
      console.log(`waiting for state >= yellow from elastic for ${this.name} via\n${cmd}`);
    } else if (!Utils.is_number(interval) || (interval < 1000)) {
      throw Error('gap time between consecutive requests must be >= 1000');
    }

    await new Promise(resolve => {
      let cnt = 0;
      const again = () => {
        const time = !cnt++ ? Math.random() * interval : interval;
        setTimeout(() => wait_for_elastic_helper(cmd, again, resolve, this.name, verbose), time);
      };
      again();
    });
  }

  async wait_for_kibana(interval: number, verbose?: boolean) {
    if (!this.kibana) {
      throw Error('This node isnt a kibana node! You\'ll never get a 200 response.');
    } else if (!Utils.is_number(interval) || (interval < 1000)) {
      throw Error('gap time between consecutive requests must be >= 1000');
    }

    const cmd = `gcloud compute ssh ${this.name} ` +
        `--zone ${this.zone} ` +
        `--command 'curl -s -o /dev/null -w "%{http_code}" localhost:5601'`;

    if (verbose) {
      console.log(`waiting for status 200 from kibana for ${this.name} via\n${cmd}`);
    }

    await new Promise(resolve => {
      let cnt = 0;
      const again = () => {
        const time = !cnt++ ? Math.random() * interval : interval;
        setTimeout(() => wait_for_kibana_helper(cmd, again, resolve, this.name, verbose), time);
      };
      again();
    });
  }

  private _set_created(v: INode) {
    if (!Utils.is_integer(v.created) || (v.created <= 0)) {
      throw Error('invalid value for created.');
    }
    this.created = v.created;
  }

  private _set_ip(v: INode) {
    if (!Utils.is_string(v.ip) || !v.ip) {
      throw Error('ip not a valid string');
    }
    this.ip = v.ip;
  }
}

const wait_for_elastic_helper = async(cmd, again, resolve, name, verbose) => {
  if (verbose) {
    console.log(`checking elastic health for ${name}`);
  }

  try {
    const res = await Utils.exec(cmd);
    const d = JSON.parse(<string> res);
    (d.status !== 'yellow') && (d.status !== 'green') ? again() : resolve();
  } catch (err) {
    again();
  }
};

const wait_for_kibana_helper = async(cmd, again, resolve, name, verbose) => {
  if (verbose) {
    console.log(`checking kibana health for ${name}`);
  }

  try {
    const res = await Utils.exec(cmd);
    res !== '200' ? again() : resolve();
  } catch (err) {
    again();
  }
};

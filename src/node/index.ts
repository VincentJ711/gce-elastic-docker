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

  // returns the standard elasticsearch json response for GET _cluster/health
  async cluster_health(verbose?: boolean) {
    if (verbose) {
      console.log(`fetching cluster health for ${this.name}`);
    }

    try {
      const cmd = 'curl -s localhost:9200/_cluster/health';
      const res = await this.exec(cmd);
      return JSON.parse(<string> res);
    } catch (e) { }
  }

  // returns green | yellow | red | undefined
  async cluster_state(verbose?: boolean) {
    if (verbose) {
      console.log(`fetching cluster state for ${this.name}`);
    }

    try {
      return (await this.cluster_health()).status;
    } catch (e) { }
  }

  async delete(verbose?: boolean) {
    const cmd = `printf "y\n" | gcloud compute instances delete ${this.name} --zone ${this.zone}`;

    if (verbose) {
      console.log(`deleting instance ${this.name} via ${cmd}`);
    }

    await Utils.exec(cmd, verbose);
  }

  // executes the given command in the container and returns its stdout.
  // note that the cmd is base64 encoded so we dont have to worry about special
  // characters like $ or quotes.
  async exec(cmd: string, verbose?: boolean) {
    if (!Utils.is_string(cmd) || !cmd) {
      throw Error('command missing!');
    }

    const b64 = Buffer.from(cmd).toString('base64');

    // find my containers id, pass it to docker exec and run the given cmd.
    const wrapped_cmd = `gcloud compute ssh ${this.name} --zone ${this.zone} ` +
        `--command "sudo docker exec -i \\$(sudo docker ps -a | grep ${this.image} | ` +
        `cut -d ' ' -f 1) bash -c 'eval \\$(echo ${b64} | base64 --decode)'"`;

    if (verbose) {
      console.log(`executing the following command\n${wrapped_cmd}`);
    }

    return await Utils.exec(wrapped_cmd, verbose);
  }

  async kibana_saved_objects(verbose?: boolean) {
    if (!this.kibana) {
      throw Error(`${this.name} isnt a kibana node!`);
    }

    const cmd = 'curl localhost:5601/api/saved_objects/_find?per_page=10000';

    if (verbose) {
      console.log(`fetching kibana saved objects for ${this.name}`);
    }

    const resp = <string> await this.exec(cmd);
    return JSON.parse(resp).saved_objects;
  }

  // returns number | undefined
  async kibana_status(verbose?: boolean) {
    if (!this.kibana) {
      return;
    } else if (verbose) {
      console.log(`fetching kibana status for ${this.name}`);
    }

    try {
      const cmd = 'curl -s -o /dev/null -w "%{http_code}" localhost:5601';
      const res = await this.exec(cmd);
      return res ? Number(res) : undefined;
    } catch (e) { }
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
    if (!Utils.is_number(interval) || (interval < 1000)) {
      throw Error('gap time between consecutive requests must be >= 1000');
    }

    if (verbose) {
      console.log(`waiting for state >= yellow from elastic for ${this.name}`);
    }

    await new Promise(resolve => {
      let cnt = 0;

      const again = () => {
        setTimeout(async() => {
          const state = await this.cluster_state(verbose);
          /yellow|green/.test(state) ? resolve() : again();
        }, !cnt++ ? Math.random() * interval : interval);
      };

      again();
    });
  }

  async wait_for_kibana(interval: number, verbose?: boolean) {
    if (!this.kibana) {
      throw Error(`${this.name} isnt a kibana node! You\'ll never get a 200 response.`);
    } else if (!Utils.is_number(interval) || (interval < 1000)) {
      throw Error('gap time between consecutive requests must be >= 1000');
    }

    if (verbose) {
      console.log(`waiting for status 200 from kibana for ${this.name}`);
    }

    await new Promise(resolve => {
      let cnt = 0;

      const again = () => {
        setTimeout(async() => {
          const status = await this.kibana_status(verbose);
          status === 200 ? resolve() : again();
        }, !cnt++ ? Math.random() * interval : interval);
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

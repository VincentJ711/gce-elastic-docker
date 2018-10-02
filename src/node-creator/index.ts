import { writeFileSync } from 'fs';
import { removeSync } from 'fs-extra';
import * as tempy from 'tempy';
import { ChildNode } from '../child-node';
import { elastic_uploader } from '../elastic-uploader';
import { kibana_password_dir, kibana_users_env_var } from '../image';
import { INode, Node } from '../node';
import { NodeCreateOpts } from '../node-create-opts';
import { EndTask, FullTask, INodeCreateTasks } from '../tasks';
import { Utils } from '../utils';

export class NodeCreator {
  private n: ChildNode;
  private o: NodeCreateOpts;

  constructor(node: ChildNode, opts: NodeCreateOpts) {
    if (node.kibana && !opts.kibana_network_tag) {
      throw Error(`missing required kibana network tag for kibana node ${node.name}`);
    }

    this.n = node;
    this.o = opts;
  }

  create(): INodeCreateTasks {
    const tasks: INodeCreateTasks = {
      elastic_ready: new FullTask(),
      kibana_ready: new FullTask(),
      main: new EndTask(),
      node_create: new FullTask(),
      scripts_upload: new FullTask(),
      sm_upload: new FullTask()
    };

    process.nextTick(async() => {
      try {
        const node = await this._make_node(tasks.node_create);
        await this._wait_for_elastic(tasks.elastic_ready, node);
        await this._wait_for_kibana(tasks.kibana_ready, node);
        await this._upload_sm(tasks.sm_upload, node);
        await this._upload_scripts(tasks.scripts_upload, node);
        tasks.main.end_resolve_cb(node);
      } catch (e) {
        tasks.main.end_reject_cb(e);
      }
    });

    return tasks;
  }

  async partial_create() {
    return await this._make_node_no_task();
  }

  private _get_create_cmd(env_file: string) {
    const merged_labels = this.n.get_merged_labels();
    const lkeys = Object.keys(merged_labels);
    const k_tag_line = this.n.kibana ? ` --tags=${this.o.kibana_network_tag}` : '';

    return `gcloud beta compute instances create-with-container ${this.n.name} ` +
        '--format=json ' +
        `--boot-disk-size=${this.n.dsize}GB ` +
        `--boot-disk-type=${this.n.dtype} ` +
        `--machine-type=${this.n.mtype} ` +
        `--zone=${this.n.zone} ` +
        `--service-account=${this.n.service_account} ` + // necessary to pull image
        `--container-image=${this.n.image} ` +
        '--container-restart-policy=always ' +
        '--container-privileged ' + // necessary to set memlock ulimit
        '--container-mount-host-path=mount-path=' +
            '/usr/share/elasticsearch/data,host-path=/home/es-data,mode=rw ' +
        `--container-mount-host-path=mount-path=${kibana_password_dir},` +
            'host-path=/home/kibana-users,mode=rw ' +
        `--labels=${lkeys.map(k => `${k}=${merged_labels[k]}`).join(',')} ` +
        '--metadata=startup-script="' +
            `echo 'vm.max_map_count=${this.n.max_map_count}' > /etc/sysctl.conf; ` +
            'sysctl -p; ' +
            'mkdir -m 777 /home/es-data; ' +
            'mkdir -m 777 /home/kibana-users;" ' +
            `--container-env-file=${env_file} ` +
            k_tag_line;
  }

  private async _make_node(task: FullTask): Promise<Node> {
    await task.start_resolve_cb();

    let node;

    try {
      node = await this._make_node_no_task();
    } catch (e) {
      this._stop_at_task(task, e);
    }

    task.end_resolve_cb(node);
    return node;
  }

  private async _make_node_no_task(): Promise<Node> {
    let tmp_env_file;

    try {
      tmp_env_file = this._make_temp_env_file();
      const cmd = this._get_create_cmd(tmp_env_file);

      if (this.o.verbose) {
        console.log(`creating node ${this.n.name} w/ the following command:\n\n${cmd}`);
      }

      const res = await Utils.exec(cmd, this.o.verbose);
      removeSync(tmp_env_file);

      const dat = JSON.parse(<string> res);
      const copy: INode = JSON.parse(JSON.stringify(this.n));
      copy.ip = dat[0].networkInterfaces[0].networkIP;
      copy.created = (new Date(dat[0].creationTimestamp)).valueOf();

      return new Node(copy);
    } catch (e) {
      removeSync(tmp_env_file);
      throw e;
    }
  }

  private _make_temp_env_file() {
    const env = this.n.get_merged_env();
    const kusers_env_value = this.o.get_kibana_users_env_value();

    if (this.n.kibana && kusers_env_value) {
      env[kibana_users_env_var] = kusers_env_value;
    }

    const file = tempy.file();
    const file_content = Object.keys(env).map(k => `${k}=${env[k]}`).join('\n');
    writeFileSync(file, file_content);
    return file;
  }

  private _stop_at_task(task: FullTask, err) {
    task.end_reject_cb(err);
    throw err;
  }

  private async _upload_scripts(task: FullTask, node: Node) {
    await task.start_resolve_cb();

    try {
      const res = await elastic_uploader.scripts(node, this.o.scripts, this.o.verbose);
      task.end_resolve_cb(res);
    } catch (e) {
      this._stop_at_task(task, e);
    }
  }

  private async _upload_sm(task: FullTask, node: Node) {
    await task.start_resolve_cb();

    try {
      const res = await elastic_uploader.sm(node, this.o.sm, this.o.verbose);
      task.end_resolve_cb(res);
    } catch (e) {
      this._stop_at_task(task, e);
    }
  }

  private async _wait_for_elastic(task: FullTask, node: Node) {
    await task.start_resolve_cb();
    await node.wait_for_elastic(this.o.interval, this.o.verbose);
    task.end_resolve_cb();
  }

  private async _wait_for_kibana(task: FullTask, node: Node) {
    await task.start_resolve_cb();
    if (this.n.kibana) {
      await node.wait_for_kibana(this.o.interval, this.o.verbose);
    }
    task.end_resolve_cb();
  }
}

import { writeFileSync } from 'fs';
import { removeSync } from 'fs-extra';
import * as tempy from 'tempy';
import { elastic_uploader } from '../elastic-uploader';
import { Node } from '../node';
import { NodeUpdateOpts } from '../node-update-opts';
import { EndTask, FullTask, INodeUpdateTasks } from '../tasks';
import { Utils } from '../utils';

export class NodeUpdater {
  private n: Node;
  private o: NodeUpdateOpts;

  constructor(node: Node, opts: NodeUpdateOpts) {
    this.n = node;
    this.o = opts;
  }

  update(): INodeUpdateTasks {
    const tasks: INodeUpdateTasks = {
      elastic_ready: new FullTask(),
      kibana_ready: new FullTask(),
      main: new EndTask(),
      node_update: new FullTask(),
      scripts_upload: new FullTask(),
      sm_upload: new FullTask()
    };

    process.nextTick(async() => {
      try {
        await this._update_node(tasks.node_update);
        await this._wait_for_elastic(tasks.elastic_ready);
        await this._wait_for_kibana(tasks.kibana_ready);
        await this._upload_sm(tasks.sm_upload);
        await this._upload_scripts(tasks.scripts_upload);
        tasks.main.end_resolve_cb(this.n);
      } catch (e) {
        tasks.main.end_reject_cb(e);
      }
    });

    return tasks;
  }

  private _get_update_cmd(env_file: string) {
    const env_to_rm = this.n.get_env_to_remove();
    const rm_env_line = env_to_rm.length ?
        `--remove-container-env=${env_to_rm.join(',')}` : '';
    return `gcloud beta compute instances update-container ${this.n.name} --format=json ` +
        `--zone ${this.n.zone} --container-env-file=${env_file} ${rm_env_line}`;
  }

  private _make_temp_env_file() {
    const env = this.n.get_merged_env();
    const file = tempy.file();
    const file_content = Object.keys(env).map(k => `${k}=${env[k]}`).join('\n');
    writeFileSync(file, file_content);
    return file;
  }

  private _stop_at_task(task: FullTask, err) {
    task.end_reject_cb(err);
    throw err;
  }

  private async _update_node(task: FullTask) {
    await task.start_resolve_cb();

    let tmp_env_file;

    try {
      tmp_env_file = this._make_temp_env_file();
      const cmd = this._get_update_cmd(tmp_env_file);

      if (this.o.verbose) {
        console.log(`updating node ${this.n.name} w/ the following command:\n\n${cmd}`);
      }

      const res = await Utils.exec(cmd);
      removeSync(tmp_env_file);

      const dat = JSON.parse(<string> res);
      this.n.eip = dat.networkInterfaces[0].accessConfigs[0].natIP;
      this.n.ip = dat.networkInterfaces[0].networkIP;
    } catch (e) {
      removeSync(tmp_env_file);
      this._stop_at_task(task, e);
    }

    task.end_resolve_cb(this.n);
  }

  private async _upload_scripts(task: FullTask) {
    await task.start_resolve_cb();

    try {
      const res = await elastic_uploader.scripts(this.n, this.o.scripts, this.o.verbose);
      task.end_resolve_cb(res);
    } catch (e) {
      this._stop_at_task(task, e);
    }
  }

  private async _upload_sm(task: FullTask) {
    await task.start_resolve_cb();

    try {
      const res = await elastic_uploader.sm(this.n, this.o.sm, this.o.verbose);
      task.end_resolve_cb(res);
    } catch (e) {
      this._stop_at_task(task, e);
    }
  }

  private async _wait_for_elastic(task: FullTask) {
    await task.start_resolve_cb();
    await this.n.wait_for_elastic(this.o.interval, this.o.verbose);
    task.end_resolve_cb();
  }

  private async _wait_for_kibana(task: FullTask) {
    await task.start_resolve_cb();
    if (this.n.kibana) {
      await this.n.wait_for_kibana(this.o.interval, this.o.verbose);
    }
    task.end_resolve_cb();
  }
}

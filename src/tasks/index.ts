export class EndTask {
  private _end_rejects: any[] = [];
  private _end_resolves: any[] = [];

  end_reject_cb(args?) {
    this._end_rejects.forEach(reject => reject(args));
  }

  end_resolve_cb(args?) {
    this._end_resolves.forEach(resolve => resolve(args));
  }

  on_end(): Promise<any> {
    return new Promise((resolve, reject) => {
      this._end_rejects.push(reject);
      this._end_resolves.push(resolve);
    });
  }
}

export class FullTask extends EndTask {
  private _start_resolves: any[] = [];

  on_start(): Promise<any> {
    return new Promise(resolve => {
      this._start_resolves.push(resolve);
    });
  }

  // we should stop when weve started a task until the client knows
  // we have started, otherwise things like syncronous log statements will confuse them
  // ie log statements will fire for the task before the on_start method is fired
  // since the then handler for a promise is asyncronous.
  async start_resolve_cb(args?) {
    await new Promise(res => {
      this._start_resolves.forEach(resolve => resolve(args));
      process.nextTick(res);
    });
  }
}

export interface INodeCreateTasks {
  elastic_ready: FullTask;
  kibana_ready: FullTask;
  kso_upload: FullTask;
  main: EndTask;
  node_create: FullTask;
  scripts_upload: FullTask;
  sm_upload: FullTask;
}

export interface INodeUpdateTasks {
  elastic_ready: FullTask;
  kibana_ready: FullTask;
  kso_upload: FullTask;
  main: EndTask;
  node_update: FullTask;
  scripts_upload: FullTask;
  sm_upload: FullTask;
}

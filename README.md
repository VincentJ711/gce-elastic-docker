# gce-elastic-docker
This package helps you set up  [Elasticsearch](https://www.elastic.co/guide/en/elasticsearch/reference/current/index.html)/[Kibana](https://www.elastic.co/guide/en/kibana/current/index.html) clusters on Google Compute Engine. If you're also looking for a similar way to setup Elasticsearch/Kibana locally for development, look at [this repo](https://github.com/VincentJ711/local-elastic-docker).

## Getting Started
There are 5 main stages when using this module.
1. creating Elasticsearch/Kibana Docker images locally.
2. deploying these images to your Google Container Registry.
3. creating a firewall rule to open your Kibana nodes on ports 80/443.
4. creating Elasticsearch clusters on Compute Engine from these images.
5. fetching the nodes from all your clusters at some time in the future so you can list/update/start/stop/delete them.

### Prerequisites
You'll need `curl`/`gcloud`/`gcloud beta`/`docker` commands, a Compute Engine project that is set as your `gcloud` project, and you must also have `docker` configured to use `gcloud` as a [Docker credential helper](https://cloud.google.com/container-registry/docs/advanced-authentication#gcloud_as_a_docker_credential_helper).

With that said, I would strongly suggest you try and push a simple image to your Container Registry via the command line before you use this package. It will teach you some Docker fundamentals and will show you where your Container Registry is. Also if you've never deployed a VM on Compute Engine, you should try that too.

### Installation
`npm install gce-elastic-docker`

### Examples
If you would like to run these examples (recommended), copy/paste the files in ./examples and run them, ie `node single-node-ex` and `node multi-node-ex`. Also please make sure you delete the VMs when you are not using them, otherwise charges will incur on your GCE billing account. You can find your VMs [here](https://console.cloud.google.com/compute/instances).
#### creating an Elasticsearch Docker image locally
you can view your local images w/ `docker images`
```
const ged = require('gce-elastic-docker');
const verbose = true;
const gce_project_id = 'my-project-id'; // replace w/ yours
const es_image_name = `gcr.io/${gce_project_id}/es-image`;

const mk_es_image = async () => {
  await (new ged.Image({
    es_version: '6.3.2',
    name: es_image_name
  })).create(verbose);
};
```

#### creating a Kibana Docker image locally

```
const kib_image_name = `gcr.io/${gce_project_id}/kib-image`;

const mk_kib_image = async () => {
  await (new ged.Image({
    es_version: '6.3.2',
    name: kib_image_name,
    kibana: true
  })).create(verbose);
};
```

#### deploying them to Google Container Registry
you can find your registry [here](https://console.cloud.google.com/gcr/images) and then select your project.

```
const deploy_es_image = async () => {
  await (new ged.Image({
    es_version: '6.3.2',
    name: es_image_name
  })).deploy(verbose);
};

const deploy_kib_image = async () => {
  await (new ged.Image({
    es_version: '6.3.2',
    name: kib_image_name,
    kibana: true
  })).deploy(verbose);
};
```

#### creating a firewall rule for your Kibana nodes
you can find your firewall rules [here](https://console.cloud.google.com/networking/firewalls)
```
const kibana_firewall = 'kibana-firewall';
const kibana_network_tag = 'kibana-network-tag';

const mk_kibana_firewall = async () => {
  await ged.kibana_firewall.create({
    name: kibana_firewall,
    network_tag: kibana_network_tag,
    verbose: verbose
  });
};
```

#### creating a single md node cluster w/ Kibana
you can find your default gce service account [here](https://console.cloud.google.com/iam-admin/iam)

```
// replace w/ yours
const gce_service_acc = '123456-compute@developer.gserviceaccount.com';

const mk_node = async () => {
  const child_node = new ged.ChildNode({
    image: kib_image_name,
    cluster_name: 'single-node-cluster',
    name: `single-node`,
    dsize: 10,
    dtype: 'pd-ssd',
    hsize: 500,
    mtype: 'n1-standard-1',
    zone: 'us-west1-a',
    kibana: true,
    service_account: gce_service_acc
  });

  const tasks = child_node.create({
    verbose: verbose,
    kibana_network_tag: kibana_network_tag,
    kibana_users: { 'tom': 'hanks' }
  });

  return await tasks.main.on_end();
};
```

#### creating nodes for a 4 node cluster (3 md, 1 Kibana)
```
const mk_cluster = async () => {
  const child_nodes = [0,1,2,3].map(num => {
    return new ged.ChildNode({
      image: !num ? kib_image_name : es_image_name,
      cluster_name: 'my-cluster',
      name: `node-${num}`,
      dsize: 10,
      dtype: 'pd-ssd',
      hsize: 500,
      mtype: 'n1-standard-1',
      zone: 'us-west1-a',
      master: !!num,
      data: !!num,
      kibana: !num,
      service_account: gce_service_acc
    });
  });

  const promises = child_nodes.map(n => {
    return n.partial_create({
      verbose: verbose,
      kibana_network_tag: kibana_network_tag,
      kibana_users: !n.kibana ? {} : { 'tom': 'hanks' }
    });
  });

  return await Promise.all(promises);
};
```

#### connecting the 4 nodes to form the cluster
```
const connect_nodes = async (nodes) => {
  const master_ips = nodes.filter(n => n.master).map(n => n.ip);
  const promises = nodes.map(n => {
    n.set_env({
      'discovery.zen.ping.unicast.hosts': master_ips.toString(),
      'discovery.zen.minimum_master_nodes': 2
    });
    const tasks = n.update({ verbose: verbose });
    return tasks.main.on_end();
  });

  return await Promise.all(promises);
};
```

#### tieing it all together
```
const single_node_combo = async () => {
  await mk_es_image();
  await mk_kib_image();
  await deploy_es_image();
  await deploy_kib_image();
  await mk_kibana_firewall();
  const node = await mk_node();
};

const multi_node_combo = async () => {
  await mk_es_image();
  await mk_kib_image();
  await deploy_es_image();
  await deploy_kib_image();
  await mk_kibana_firewall();
  const nodes = await mk_cluster();
  await connect_nodes(nodes);
};
```

#### fetching the nodes from your clusters later
```
const fetch_nodes_for_later = async() => {
  const nodes = await ged.Node.fetch_all(verbose);
  console.log('\n', nodes, '\n');
};
```

## API overview
Everything that follows can be found on the `gce` object. Fields with ? denote an optional field (typescript) and [false] denotes a field with a default value of false. Entities prefixed with an `I` indicate an interface. Finally, any param/option that is `verbose` just indicates the operation will run w/ logging.

- `kibana_password_dir` the directory in the Kibana containers where your Kibana users are.
- `kibana_password_file` the file in the Kibana containers where your Kibana users are stored.
- `kibana_users_env_var` the environment variable that has your initial list of Kibana users.
- `registries` the GCE Container Registries used.
- `m_types` an object of GCE zones to GCE machine types. ie

  ```
  {
    'us-west2-b': [
      'f1-micro',
      'g1-small'
      ...
    ],
    'us-west2-c': [
      'f1-micro',
      'g1-small'
      ...
    ]
    ...
  }
  ```

- `zones` the GCE zones used.
- `regions` the GCE regions used.
- `short_regions` shorter versions of `ged.regions`. use this if you want to include a shorter version of a region in your node names.

  ```
  ged.short_regions['us-west1'] // usw1
  ged.short_regions['northamerica-northeast1'] // nane1
  ```

### kibana_firewall
- `create(opts): Promise` creates a firewall rule that opens ports 80/443 to ONLY your Kibana nodes.

  ```
  opts {
    name: string;
    network_tag: string;
    suppress?: boolean;
    verbose?: boolean;
  }
  ```

  - `name` the name of the firewall rule.
  - `network_tag` the tag to apply the firewall rule to, in other words, the tag that is on all your Kibana VMs.
  - `suppress[true]` ignores the error that says the rule has already been created.
  - `verbose[false]`
- `delete(opts): Promise` removes the firewall rule

  ```
  opts {
    name: string;
    suppress?: boolean;
    verbose?: boolean;
  }
  ```

  - `name` the name of the firewall rule.
  - `suppress[true]` ignores the error that says the rule doesn't exist.
  - `verbose[false]`

### Image
- `constructor(opts)`

  ```
  opts {
    es_version: string;
    kibana?: boolean;
    name: string;
  }
  ```

  - `es_version` the Elasticsearch version you want to use.
  - `kibana[false]` should this image have Kibana installed?
  - `name` the name of the image to create. It must follow the format {gce-registry}/{gce-project-id}/{image-name}, ie `gcr.io/my-project-id/my-image`

- `prototype.create(verbose?: boolean[false]): Promise` creates a Docker image locally.
- `prototype.deploy(verbose?: boolean[false]): Promise` deploys the image to your Google Container Registry (make sure the image exists locally)

### EndTask
- `prototype.on_end(): Promise` denotes when a task has finished. it may resolve or reject w/ data. see the specific task to determine when it does resolve w/ data.

### FullTask extends EndTask
- `prototype.on_start(): Promise` denotes when a task has started. it will never reject.

### INodeCreateTasks
The following tasks are executed in the order you see.

```
{
  main: EndTask;
  node_create: FullTask;
  elastic_ready: FullTask;
  kibana_ready: FullTask;
  sm_upload: FullTask;  
  scripts_upload: FullTask;
}
```

- `main` concludes when all the other tasks have finished. It will resolve w/ an instance of `Node` if it is successful and it will reject with the first task that rejects' error.
- `node_create` will resolve w/ an instanceof `Node` once the VM has been created.
- `elastic_ready` concludes when Elasticsearch goes live. it works by submitting `gcloud compute ssh` curl requests to your Elasticsearch nodes VM at regular intervals waiting until it responds w/ a cluster state >= yellow.
- `kibana_ready` concludes when Kibana goes live. it works by submitting `gcloud compute ssh` curl requests to your Kibana nodes VM at regular intervals waiting until it responds w/ a status of 200. If the node isn't a Kibana node, the task will finish immediately.
- `sm_upload` concludes once all settings/mappings have been uploaded. If the settings and mappings already existed, this will still resolve.
  - if settings/mappings are uploaded for a users index, you'll get something like (standard Elasticsearch response)

    ```
    [{ acknowledged: true, shards_acknowledged: true, index: 'users' }]
    ```

  - if N indices are uploaded and 1 of them fails, this task will reject with something like (standard Elasticsearch response)

    ```
    {
      error: {
        root_cause: [ [Object] ],
        type: 'illegal_argument_exception',
        reason: 'Failed to parse value [0] for setting [index.number_of_shards] must be >= 1'
      },
      status: 400
    }
    ```

- `scripts_upload` concludes once all scripts have been uploaded (after testing Elasticsearch 6.3.2, it seems that Elasticsearch doesn't complain if you overwrite a script)
  - if two scripts are uploaded successfully, this task will resolve w/ something like (standard Elasticsearch response)

    ```
    [{ acknowledged: true }, { acknowledged: true }]
    ```

  - if N scripts are uploaded and 1 of them fails, this task will reject with something like (standard Elasticsearch response)

    ```
    {
      error: {
        root_cause: [ [Object] ],
        type: 'illegal_argument_exception',
        reason: 'unable to put stored script with unsupported lang [painlesss]'
      },
      status: 400
    }
    ```

### INodeUpdateTasks
The following tasks are executed in the order you see.

```
{
  main: EndTask;
  node_update: FullTask;
  elastic_ready: FullTask;
  kibana_ready: FullTask;
  sm_upload: FullTask;
  scripts_upload: FullTask;
}
```

- `main` ""
- `node_update` will resolve w/ an instanceof Node once the VM has been updated.
- `elastic_ready` ""
- `kibana_ready` ""
- `sm_upload` ""
- `scripts_upload` ""

### IElasticScript
```
{
  lang: string;
  source: string;
}
```

### INodeCreateOpts
```
{
  interval?: number;
  kibana_network_tag?: string;
  kibana_users?: { [username: string]: string };
  scripts?: { [name: string]: IElasticScript };
  sm?: object;
  verbose?: boolean;
}
```
- `interval[2000]` interval in milliseconds between consecutive `gcloud compute ssh` requests. these requests are purely health checks on your Elasticsearch/Kibana statuses. as a good rule, if you are making a cluster of N nodes, set this to 5000 * N.
- `kibana_network_tag` required if the node you are creating is a Kibana node. if you do not provide this for a Kibana node, an error will be thrown.
- `kibana_users[{}]` an object of usernames to passwords. these are the users you want to access your Kibana nodes through the browser.

  ```
  {
    'meryl': 'streep',
    'tom': 'hanks'
  }
  ```

- `scripts[{}]` an object of Elasticsearch scripts. the root keys are the script ids and their values are the scripts themselves.

  ```
  {
    calc_score: {
      lang: 'painless',
      source: 'Math.log(_score * 2) + params.my_modifier'
    }
  }
  ```

- `sm[{}]` an object of Elasticsearch index settings/mappings. the root keys are the indices and their values are their settings/mappings.

  ```
  {
    users: {
      mappings: { _doc: { properties: { name: { type: 'keyword' } } } },
      settings: { number_of_shards: 1 }
    }
  }
  ```

- `verbose[false]`

### INodeUpdateOpts
```
{
  interval?: number;
  scripts?: { [name: string]: IElasticScript };
  sm?: object;
  verbose?: boolean;
}
```

- `interval[2000]` ""
- `scripts[{}]` ""
- `sm[{}]` ""
- `verbose[false]`

### BaseNode
- `constructor(opts)`

  ```
  opts {
    name: string;
    cluster_name: string;
    master?: boolean;
    data?: boolean;
    ingest?: boolean;
    kibana?: boolean;
    hsize: number;
    khsize?: number;
    max_map_count?: number;
    env?: {};
    labels?: {};
    zone: string;
    mtype: string;
    dsize: number;
    dtype: 'pd-standard' | 'pd-ssd';
    image: string;
    service_account: string;
  }
  ```

  - `name` the name for this node and its VM.
  - `cluster_name` the cluster name for this node.
  - `master[true]` is this an master node?
  - `data[true]` is this an data node?
  - `ingest[false]` is this an ingest node?
  - `kibana[false]` is this a node w/ Kibana? MUST be set if it is.
  - `hsize` the heap size in MB you want to give to Elasticsearch. see [here](https://www.elastic.co/guide/en/elasticsearch/guide/master/heap-sizing.html)
  - `khsize[512]` the max heap size in MB you want to give to your Kibana NodeJS process. this is the value for V8's `NODE_OPTIONS=--max-old-space-size`.
  - `max_map_count[262144]` see [here](https://www.elastic.co/guide/en/elasticsearch/guide/master/_file_descriptors_and_mmap.html)
  - `env[{}]` any Elasticsearch environment variables you want set along w/ their values. You should only read from this. You should not write to this directly. To write to this, use `BaseNode.prototype.set_env` instead.
  - `labels[{}]` any labels you want set on the VM instance. note, `ged` is reserved; its used by this package to identify VMs this package has made. also note, you can only set labels on create. you cannot change labels or update them later. the reason for this is due to the nature of the `gcloud beta compute instances update-container` command. currently, it does not allow you to set environment variables/labels at the same time. updating a container should only be one command. by splitting it into two commands, you run the risk of label/environment variable inconsistency if by rare chance one of the gcloud update calls fail.
  - `zone` the GCE zone you want to place this nodes VM in.
  - `mtype` the GCE machine type you want to use for this nodes VM.
  - `dsize` the disk size in GB you want for this nodes VM. must be atleast 10.
  - `dtype` the disk type you want for this nodes VM. either `pd-ssd` or `pd-standard`
  - `image` the name of the image in your Google Container Registry to use for this nodes VM. If this is a Kibana node, make sure you place a Kibana image here.
  - `service_account` the default GCE service account to use. this is necessary for the VM to pull your image from your Container Registry.
  - `region` auto set by the constructor. determined from the zone you provide.
  - `short_region` auto set by the constructor. determined from the zone you provide.
- `prototype.set_env(env: {})` call this method when you want to add/delete environment variables on the VM. To delete an environment variable, set its value as null. This is local, to persist them, you'll need to call `Node.prototype.update`.

  ```
  node.set_env({
    'discovery.zen.ping.unicast.hosts': '10.2.3.4, 10.2.3.5',
    'a_var_to_remove': null
  })
  ```

    the following environment variables are reserved and thus you cannot set them

    ```
    [
      'kibana_users',
      'ged',
      'bootstrap.memory_lock',
      'cluster.name',
      'ES_JAVA_OPTS',
      'network.host',
      'node.data',
      'node.ingest',
      'node.master',
      'node.name',
      'NODE_OPTIONS'
    ]
    ```

- `prototype.set_hsize(v: number)` the new value you want for the heap size in MB. to persist the changes, you'll need to call `Node.prototype.update`.
- `prototype.set_khsize(v?: number)` the new value you want for the max Kibana heap size in MB. to persist the changes, you'll need to call `Node.prototype.update`. If `undefined` is given ,the default value of 512 is used.


### ChildNode extends BaseNode
- `prototype.create(opts: INodeCreateOpts): INodeCreateTasks` executes all the tasks found in `INodeCreateTasks`. Use this method when you deploy single-node clusters.
- `prototype.partial_create(opts: INodeCreateOpts): Promise<Node>` ONLY creates the VM. Use this when you want to deploy a cluster. The reason for this is purely to save time. In order to make a cluster, the nodes have to be created first to fetch their internal ips. Once the ips are obtained, the nodes have to be restarted w/ the new ips set as value to the `discovery.zen.ping.unicast.hosts` environment variable.  This is necessary for the nodes to connect and form a cluster. It makes no sense to call `ChildNode.prototype.create` and wait for Elastic/Kibana to be ready when your just going to restart it.

### Node extends BaseNode
- `fetch_all(verbose?: boolean[false]): Promise<Nodes[]>` fetches all the nodes this package has created. It does so by fetching the VMs w/ the `ged` label and grabbing the value for its `ged` environment variable.

- `constructor(opts)` opts are all the ones found in the `BaseNode` constructor plus

  ```
  {
    created: number;
    ip: string;
  }
  ```

  - `created` when the nodes VM was created in milliseconds since epoch (UTC).
  - `ip` the internal ip set on the VM. this ip does not change between VM starts/stops.
- `prototype.update(opts: INodeUpdateOpts): INodeUpdateTasks` executes all the tasks found on `INodeUpdateTasks`. This restarts the VM the node is hosted on.
- `prototype.start(verbose?: boolean[false])` starts the hosting VM.
- `prototype.stop(verbose?: boolean[false])` stops the hosting VM
- `prototype.restart(verbose?: boolean[false])` stops then starts the hosting VM.
- `prototype.delete(verbose?: boolean[false])` deletes the hosting VM.
- `prototype.wait_for_elastic(interval: number[2000], verbose?: boolean[false])` sends health checks to your elastisearch node at port 9200 via `gcloud compute ssh` waiting for cluster state >= yellow. there is an interval between requests you can specify.
- `prototype.wait_for_kibana(interval: number, verbose?: boolean[false])` sends health checks to your Kibana node at port 5601 via `gcloud compute ssh` waiting for status 200. there is an interval between requests you can specify.
- `prototype.curl(cmd: string, verbose?: boolean): Promise` executes the given command on the nodes VM by inserting it into `gcloud compute ssh ... <cmd>`. You MUST wrap cmd either in single quotes or double quotes. expect only curl requests to work as the Container OS file system is locked down.

  ```
  const resp = await node.curl('"curl localhost:9200/_cluster/health"');
  const status = JSON.parse(resp).status; // yellow | green | red ...
  ```

- `prototype.cluster_health(verbose?: boolean[false]): Promise<{} | undefined>` curls the host on port 9200 and asks for its cluster health. If it succeeds, it resolves with the standard Elasticsearch response. If it fails or gets no response, it resolves with `undefined`. For example:

  ```
  {
    cluster_name: 'single-node-cluster',
    status: 'green',
    timed_out: false,
    number_of_nodes: 1,
    number_of_data_nodes: 1,
    active_primary_shards: 0,
    active_shards: 0,
    relocating_shards: 0,
    initializing_shards: 0,
    unassigned_shards: 0,
    delayed_unassigned_shards: 0,
    number_of_pending_tasks: 0,
    number_of_in_flight_fetch: 0,
    task_max_waiting_in_queue_millis: 0,
    active_shards_percent_as_number: 100
  }
  ```

- `prototype.cluster_state(verbose?: boolean[false]): Promise<string | undefined>` curls the host on port 9200 and asks for its cluster health state. If it succeeds, it resolves with `green | yellow | red`. If it fails or gets no response, it resolves with `undefined`.
- `prototype.kibana_status(verbose?: boolean[false]): Promise<number | undefined>` curls the host on port 5601 and checks the http status code. If it succeeds, it resolves with a number (like 200). If it fails or gets no response, it resolves with `undefined`.

## supported versions of Elasticsearch/Kibana
Currently, 5.x and 6.x should work. When future major versions are released, i'll do my best to keep up to date.

## FAQ
For general insight into how this package works, I strongly recommend you create a single node cluster and set verbose to true.

- What can i / cant i update for a node/VM?
  - The only things you can update are those fields on `BaseNode.prototype` that have public setter methods, ie methods which do not start with an `_`. Currently this is `set_env`, `set_hsize` and `set_khsize`. Most of the things you will need to update for Elasticsearch/Kibana can be done through setting environment variables.
- How do i update a node/VM?
  - call the setter method on the `Node` instance and then call its `prototype.update` method. This method is asynchronous and actually takes the changes you set on the local instance and commits them to the VM instance.
- How are updates persisted?
  - Environment variables can be set for a Container VM. All the environment variables you set/update are set/update there as well. In addition to those you set, this package base64 encodes a stringified version of the `Node` instance and stores it as an environment variable, specifically the `ged` environment variable.
- How are the VMs this package created distinguished from my other VMs?
  - this package sets the `ged` label on your instance when the instance is created. This is how `Node.fetch_all` works.
- How safe are my Elasticsearch clusters?
  - All non Kibana nodes are completely isolated. They have external ips, but there are no firewall rules that open access to any port on them. You can use their internal ips from within your VMs to access them. All Kibana nodes are open on ports 80/443 to anyone, however only those that know one of your users' usernames/passwords can access them. Also note that HTTP is redirected to HTTPS which has a self signed SSL cert. self signed will give you a browser warning, but you can disregard this and proceed because we know its safe...
- How are my Kibana users stored?
  - when you create a Kibana node, the following occurs to your Kibana users:

    ```
    {
      'meryl': 'streep',
      'tom': 'hanks'
    }

    ->

    meryl:$apr1$yxz1hI19$9vEAdWWgswnZNmvke7oKG1 tom:$apr1$icMT/wUN$EDXt8IFVlI4mGywx2ZZ.8

    ->

    bWVyeWw6JGFwcjEkeXh6MWhJMTkkOXZFQWRXV2dzd25aTm12a2U3b0tHMSB0b206JGFwcjEkaWNNVC93VU4kRURYdDhJRlZsSTRtR3l3eDJaWi44Cg==

    ->

    meryl:$apr1$yxz1hI19$9vEAdWWgswnZNmvke7oKG1 tom:$apr1$icMT/wUN$EDXt8IFVlI4mGywx2ZZ.8

    ```

  In other words, your simple json is transformed to `meryl:<hash> tom:<hash>` which is bas64 encoded and stored as an environment variable on your VMs. When the container starts on your VM, the environment variable is base64 decoded and each `user:<hash>` is stored on its own line in a htpasswd file Nginx uses. Nginx is what proxies from port 443 to Kibana on port 5601. Note that once the passwords are set the first time, they are NOT reset again.
- How do i get into the container?
  - ssh into the host VM, then

    ```
    sudo -i
    docker ps -a  # get the container id
    docker exec -it <id-here> bash
    ```

- How do i see my Kibana users?
  - get into the container on the vm, then

    ```
    cat /kibana-users/.htpasswd
    ```

- How do i change/delete a Kibana user?
  - get into the container on the vm, then

    ```
    htpasswd /kibana-users/.htpasswd <username> # update users pass
    htpasswd -D /kibana-users/.htpasswd <username> # delete user
    ```

- How do i restart Nginx on my Kibana nodes?
  - get into the container on the vm, then
    ```
    nginx -s stop
    nginx
    ps -e # to verify
    ```

- How do i restart Kibana on my Kibana nodes?
  - get into the container on the vm
    ```
    ps -e | grep node # get the pid
    kill -9 <pid>
    /usr/local/bin/kentry.sh --server.host=0.0.0.0 &
    ```

- Which processes are monitored/restarted on my Kibana nodes?
  - There are 3 processes on this container: Nginx, Kibana and Elasticsearch. if Nginx or Kibana stops, the Elasticsearch process is not affected. you will have to manually restart whichever died. if the Elasticsearch process dies, the container will stop, and the hosting OS will automatically restart the container which will restart all 3 processes.
- Which processes are monitored/restarted on my Elasticsearch nodes?
  - In these containers, there is only 1 process, the Elasticsearch process. If this dies, the container will stop, and the hosting OS will automatically restart the container which will then restart the Elasticsearch process.

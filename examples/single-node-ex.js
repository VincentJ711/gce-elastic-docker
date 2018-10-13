const ged = require('gce-elastic-docker');
const verbose = true;
const gce_project_id = // 'your-gce-project-id-here';
const es_image_name = `gcr.io/${gce_project_id}/es-image`;
const kib_image_name = `gcr.io/${gce_project_id}/kib-image`;
const gce_service_acc = // '123456-compute@developer.gserviceaccount.com';
const kibana_firewall = 'kibana-firewall';
const kibana_network_tag = 'kibana-network-tag';

const mk_es_image = async () => {
  await (new ged.Image({
    es_version: '6.4.2',
    name: es_image_name
  })).create(verbose);
};

const mk_kib_image = async () => {
  await (new ged.Image({
    es_version: '6.4.2',
    name: kib_image_name,
    kibana: true
  })).create(verbose);
};

const deploy_es_image = async () => {
  await (new ged.Image({
    es_version: '6.4.2',
    name: es_image_name
  })).deploy(verbose);
};

const deploy_kib_image = async () => {
  await (new ged.Image({
    es_version: '6.4.2',
    name: kib_image_name,
    kibana: true
  })).deploy(verbose);
};

const mk_kibana_firewall = async () => {
  await ged.kibana_firewall.create({
    name: kibana_firewall,
    network_tag: kibana_network_tag,
    verbose: verbose
  });
};

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
    service_account: gce_service_acc,
    ingest: true, // required for monitoring.
    env: {
      'xpack.monitoring.collection.enabled': true
    }
  });

  const tasks = child_node.create({
    verbose: verbose,
    kibana_network_tag: kibana_network_tag,
    kibana_users: { 'tom': 'hanks' },
    kso: [{
      id: 'e84e14c0-cdeb-11e8-b958-0b2cbb7f0531',
      type: 'timelion-sheet',
      updated_at: '2018-10-12T06:56:13.323Z',
      version: 1,
      attributes: {
        title: 'sheet1',
        hits: 0,
        description: '',
        timelion_sheet: [
          '.es(*).title("I uploaded this.")'
        ],
        timelion_interval: 'auto',
        timelion_chart_height: 275,
        timelion_columns: 2,
        timelion_rows: 2,
        version: 1
      }
    }],
    scripts: {
      calc_score: {
        lang:'painless',
        source:'Math.log(_score * 2) + params.my_modifier'
      }
    },
    sm: {
      users: {
        mappings: { _doc: { properties: { name: { type: 'keyword' } } } },
        settings: { number_of_shards: 1, number_of_replicas: 0 }
      }
    }
  });

  // optional monitoring of each sub task
  tasks.node_create.on_start().then(() => console.log(0));
  tasks.node_create.on_end().then(() => console.log(1))
      .catch(err => console.error(err, 1.5));

  tasks.elastic_ready.on_start().then(() => console.log(2));
  tasks.elastic_ready.on_end().then(() => console.log(3))
      .catch(err => console.error(err, 3.5));

  tasks.kibana_ready.on_start().then(() => console.log(4));
  tasks.kibana_ready.on_end().then(() => console.log(5))
      .catch(err => console.error(err, 5.5));

  tasks.kso_upload.on_start().then(() => console.log(6));
  tasks.kso_upload.on_end().then(r => console.log(7, r))
      .catch(err => console.error(err, 7.5));

  tasks.scripts_upload.on_start().then(() => console.log(8));
  tasks.scripts_upload.on_end().then(r => console.log(9, r))
      .catch(err => console.error(err, 9.5));

  tasks.sm_upload.on_start().then(() => console.log(10));
  tasks.sm_upload.on_end().then(r => console.log(11, r))
      .catch(err => console.error(err, 11.5));

  const node = await tasks.main.on_end();
  console.log(`Done! Visit the external ip of ${node.name} and sign in as tom hanks :)`);
  return node;
};

const fetch_nodes_for_later = async() => {
  const nodes = await ged.Node.fetch_all(false); // param is verbose.
  console.log(nodes);
};

const combo = async () => {
  await mk_es_image();
  await mk_kib_image();
  await deploy_es_image();
  await deploy_kib_image();
  await mk_kibana_firewall();
  const node = await mk_node();
  await fetch_nodes_for_later();
};

combo();

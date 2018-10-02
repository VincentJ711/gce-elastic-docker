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
    es_version: '6.3.2',
    name: es_image_name
  })).create(verbose);
};

const mk_kib_image = async () => {
  await (new ged.Image({
    es_version: '6.3.2',
    name: kib_image_name,
    kibana: true
  })).create(verbose);
};

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

const mk_kibana_firewall = async () => {
  await ged.kibana_firewall.create({
    name: kibana_firewall,
    network_tag: kibana_network_tag,
    verbose: verbose
  });
};

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

  const nodes = await Promise.all(promises);
  return nodes;
};

const connect_nodes = async (nodes) => {
  const master_ips = nodes.filter(n => n.master).map(n => n.ip);

  const promises = nodes.map(n => {
    n.set_env({
      'discovery.zen.ping.unicast.hosts': master_ips.toString(),
      'discovery.zen.minimum_master_nodes': 2
    });

    // for this example the kibana node is easy to single out,
    // so only upload scripts/settings/mappings to that node. normally, you'd
    // just upload to the master(s), but it doesnt matter.
    const tasks = n.update({
      interval: 20000,
      verbose: verbose,
      sm: !n.kibana ? {} : {
        users: {
          mappings: { _doc: { properties: { name: { type: 'keyword' } } } },
          settings: { number_of_shards: 1 }
        }
      },
      scripts: !n.kibana ? {} : {
        calc_score: {
          lang:'painless',
          source:'Math.log(_score * 2) + params.my_modifier'
        }
      }
    });

    // optional monitoring of each sub task
    tasks.node_update.on_start().then(() => console.log(n.name, 0));
    tasks.node_update.on_end().then(() => console.log(n.name, 1))
        .catch(err => console.error(err, n.name, 1.5));

    tasks.elastic_ready.on_start().then(() => console.log(n.name, 2));
    tasks.elastic_ready.on_end().then(() => console.log(n.name, 3))
        .catch(err => console.error(err, n.name, 3.5));

    tasks.kibana_ready.on_start().then(() => console.log(n.name, 4));
    tasks.kibana_ready.on_end().then(() => console.log(n.name, 5))
        .catch(err => console.error(err, n.name, 5.5));

    tasks.sm_upload.on_start().then(() => console.log(n.name, 6));
    tasks.sm_upload.on_end().then(r => console.log(n.name, 7, r))
        .catch(err => console.error(err, n.name, 7.5));

    tasks.scripts_upload.on_start().then(() => console.log(n.name, 8));
    tasks.scripts_upload.on_end().then(r => console.log(n.name, 9, r))
        .catch(err => console.error(err, n.name, 9.5));

    return tasks.main.on_end();
  });

  await Promise.all(promises);
  console.log(`Done! Visit the external ip of ${nodes[0].name} and sign in as tom hanks :)`);
  return nodes;
};

const fetch_nodes_for_later = async() => {
  const nodes = await ged.Node.fetch_all(false); // param is verbose
  console.log('\n', nodes, '\n');
};

const combo = async () => {
  await mk_es_image();
  await mk_kib_image();
  await deploy_es_image();
  await deploy_kib_image();
  await mk_kibana_firewall();
  const nodes = await mk_cluster();
  await connect_nodes(nodes);
  await fetch_nodes_for_later();
};

combo();

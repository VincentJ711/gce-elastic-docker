import { Node } from '../node';
import { IElasticScript } from '../node-create-opts';
import { Utils } from '../utils';

const elastic_uploader = {
  kso: (node: Node, kso: any[], verbose?: boolean) => {
    // api call will throw if u give it an empty array, so resolve now.
    if (!kso.length) {
      return Promise.resolve([]);
    }

    // api doesnt allow the updated_at field to exist when creating a saved object.
    kso.forEach(el => delete el.updated_at);

    const b64 = Buffer.from(JSON.stringify(kso)).toString('base64');
    const url = 'localhost:5601/api/saved_objects/_bulk_create?overwrite=true';
    const cmd = `gcloud compute ssh ${node.name} --zone=${node.zone} ` +
        `--command "echo ${b64} | base64 --decode | curl -s -XPOST ${url} ` +
        `-H 'kbn-xsrf: true' -H 'Content-Type: application/json' -d @-"`;

    if (verbose) {
      console.log(`uploading kibana saved objects via\n${cmd}`);
    }

    return Utils.exec(cmd).then(ans => {
      const obj = JSON.parse(<string> ans);

      if (obj.error) {
        throw obj;
      }

      const saved_objects = obj.saved_objects;

      saved_objects.forEach(el => {
        if (el.error) {
          throw el;
        }
      });

      return saved_objects;
    });
  },
  scripts: (node: Node, scripts: { [name: string]: IElasticScript }, verbose?: boolean) => {
    const promises: any = [];

    for (const script_name in scripts) {
      const script = scripts[script_name];
      const b64 = Buffer.from(JSON.stringify({ script: script })).toString('base64');
      const cmd = `gcloud compute ssh ${node.name} --zone=${node.zone} ` +
          `--command "echo ${b64} | base64 --decode | ` +
              `curl -s -XPOST localhost:9200/_scripts/${script_name} ` +
              `-H 'Content-Type: application/json' -d @-"`;

      if (verbose) {
        console.log(`uploading script ${script_name} via\n${cmd}`);
      }

      const p = Utils.exec(cmd).then(ans => {
        const obj = JSON.parse(<string> ans);
        if (obj.error) {
          throw obj;
        }
        return obj;
      });

      promises.push(p);
    }

    return Promise.all(promises);
  },
  sm: (node: Node, sm: {}, verbose?: boolean) => {
    const promises: any = [];

    for (const index in sm) {
      const b64 = Buffer.from(JSON.stringify(sm[index])).toString('base64');
      const cmd = `gcloud compute ssh ${node.name} --zone=${node.zone} ` +
          `--command "echo ${b64} | base64 --decode | ` +
              `curl -s -XPUT localhost:9200/${index} ` +
              `-H 'Content-Type: application/json' -d @-"`;

      if (verbose) {
        console.log(`uploading settings/mappings for index ${index} via\n${cmd}`);
      }

      const p = Utils.exec(cmd).then(ans => {
        const obj = JSON.parse(<string> ans);
        if (obj.error && (obj.error.type !== 'resource_already_exists_exception')) {
          throw obj;
        }
        return obj;
      });

      promises.push(p);
    }

    return Promise.all(promises);
  }
};

export { elastic_uploader };

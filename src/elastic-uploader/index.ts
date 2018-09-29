import { Node } from '../node';
import { IElasticScript } from '../node-create-opts';
import { Utils } from '../utils';

const elastic_uploader = {
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

      const p = Utils.exec(cmd, verbose).then(ans => {
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
          `--command "echo ${b64} | base64 --decode |` +
              `curl -s -XPUT localhost:9200/${index} ` +
              `-H 'Content-Type: application/json' -d @-"`;

      if (verbose) {
        console.log(`uploading settings/mappings for index ${index} via\n${cmd}`);
      }

      const p = Utils.exec(cmd, verbose).then(ans => {
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

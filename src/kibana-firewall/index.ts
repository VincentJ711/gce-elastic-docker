import { Utils } from '../utils';

interface IFirewallCreateOpts {
  name: string;
  network_tag: string;
  suppress?: boolean;
  verbose?: boolean;
}

interface IFirewallDeleteOpts {
  name: string;
  suppress?: boolean;
  verbose?: boolean;
}

const kibana_firewall = {
  create: async(opts: IFirewallCreateOpts) => {
    if (!Utils.is_string(opts.name) || !opts.name || / /.test(opts.name)) {
      throw Error(`${opts.name} is not a valid name for a firewall rule.`);
    } else if (!Utils.is_string(opts.network_tag) || !opts.network_tag ||
          / /.test(opts.network_tag)) {
      throw Error(`${opts.network_tag} is not a valid name for a network tag.`);
    }

    const cmd = `gcloud compute firewall-rules create ${opts.name} ` +
        '--source-ranges=0.0.0.0/0 ' +
        `--target-tags=${opts.network_tag} ` +
        '--action=ALLOW --rules=tcp:80,tcp:443';

    if (opts.verbose) {
      console.log(`creating firewall rule ${opts.name} via\n${cmd}`);
    }

    if (Utils.is_defined(opts.suppress) && !opts.suppress) {
      await Utils.exec(cmd, opts.verbose);
    } else {
      const p = Utils.exec(cmd, opts.verbose);
      await p.catch(err => {
        if (!err || !err.toString() || (err.toString().indexOf('already exists') < -1)) {
          throw err;
        }
      });
    }
  },
  delete: async(opts: IFirewallDeleteOpts) => {
    if (!Utils.is_string(opts.name) || !opts.name || / /.test(opts.name)) {
      throw Error(`${opts.name} is not a valid name for a firewall rule.`);
    }

    const cmd = `printf "y\n" | gcloud compute firewall-rules delete ${opts.name}`;

    if (opts.verbose) {
      console.log(`deleting firewall rule ${opts.name} via\n${cmd}`);
    }

    if (Utils.is_defined(opts.suppress) && !opts.suppress) {
      await Utils.exec(cmd, opts.verbose);
    } else {
      const p = Utils.exec(cmd, opts.verbose);
      await p.catch(err => {
        if (!err || !err.toString() || (err.toString().indexOf('was not found') < -1)) {
          throw err;
        }
      });
    }
  }
};

export { IFirewallCreateOpts, kibana_firewall };

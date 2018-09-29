import { BaseNode, IBaseNode } from '../base-node';
import { INodeCreateOpts, NodeCreateOpts } from '../node-create-opts';
import { NodeCreator } from '../node-creator';

export interface IChildNode extends IBaseNode { }

export class ChildNode extends BaseNode implements IChildNode {
  constructor(v: IChildNode) {
    super(v);
  }

  create(opts: INodeCreateOpts) {
    return (new NodeCreator(this, new NodeCreateOpts(opts))).create();
  }

  partial_create(opts: INodeCreateOpts) {
    return (new NodeCreator(this, new NodeCreateOpts(opts))).partial_create();
  }
}

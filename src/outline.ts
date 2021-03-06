/*
 Copyright (c) 42Crunch Ltd. All rights reserved.
 Licensed under the GNU Affero General Public License version 3. See LICENSE.txt in the project root for license information.
*/

import * as vscode from 'vscode';
import { Node } from './ast';
import { configuration } from './configuration';

abstract class OutlineProvider implements vscode.TreeDataProvider<Node> {
  private _onDidChangeTreeData: vscode.EventEmitter<Node> = new vscode.EventEmitter<Node>();
  readonly onDidChangeTreeData: vscode.Event<Node> = this._onDidChangeTreeData.event;

  root: Node;
  maxDepth: number = 1;
  sort: boolean;

  constructor(
    private context: vscode.ExtensionContext,
    didChangeTree: vscode.Event<[Node, vscode.TextDocumentChangeEvent]>,
  ) {
    didChangeTree(([node, changeEvent]) => {
      const pointer = this.getRootPointer();
      if (node && pointer) {
        this.root = node.find(pointer);
      } else if (node) {
        this.root = node;
      } else {
        this.root = null;
      }
      this._onDidChangeTreeData.fire();
    });

    this.sort = configuration.get<boolean>('sortOutlines');
    configuration.onDidChange(this.onConfigurationChanged, this);
  }

  onConfigurationChanged(e: vscode.ConfigurationChangeEvent) {
    if (configuration.changed(e, 'sortOutlines')) {
      this.sort = configuration.get<boolean>('sortOutlines');
      this._onDidChangeTreeData.fire();
    }
  }

  getRootPointer(): string {
    return null;
  }

  getChildren(node?: Node): Thenable<Node[]> {
    if (!this.root) {
      return Promise.resolve([]);
    }

    if (!node) {
      node = this.root;
    }

    if (node.getDepth() > this.maxDepth) {
      return Promise.resolve([]);
    }

    return Promise.resolve(this.sortChildren(this.filterChildren(node, node.getChildren())));
  }

  filterChildren(node: Node, children: Node[]) {
    return children;
  }

  sortChildren(children: Node[]) {
    if (this.sort) {
      return children.sort((a, b) => {
        const labelA = this.getLabel(a);
        const labelB = this.getLabel(b);
        return labelA.localeCompare(labelB);
      });
    }
    return children;
  }

  getTreeItem(node: Node): vscode.TreeItem {
    const label = this.getLabel(node);
    const collapsible = this.getCollapsible(node);
    const treeItem = new vscode.TreeItem(label, collapsible);
    treeItem.command = this.getCommand(node);
    treeItem.contextValue = this.getContextValue(node);
    return treeItem;
  }

  getCollapsible(node: Node): vscode.TreeItemCollapsibleState {
    const canDisplayChildren = node.getDepth() < this.maxDepth;
    return canDisplayChildren ? vscode.TreeItemCollapsibleState.Collapsed : vscode.TreeItemCollapsibleState.None;
  }

  getLabel(node: Node): string {
    return node.getKey();
  }

  getCommand(node: Node): vscode.Command {
    const editor = vscode.window.activeTextEditor;
    const [start, end] = node.getRange();
    return {
      command: 'openapi.goToLine',
      title: '',
      arguments: [new vscode.Range(editor.document.positionAt(start), editor.document.positionAt(end))],
    };
  }

  getContextValue(node: Node) {
    return null;
  }
}

export class PathOutlineProvider extends OutlineProvider {
  maxDepth = 5;

  getRootPointer() {
    return '/paths';
  }

  filterChildren(node: Node, children: Node[]) {
    const depth = node.getDepth();
    const key = node.getKey();
    if (depth === 2) {
      return children.filter(child => {
        return ['get', 'put', 'post', 'delete', 'options', 'head', 'patch', 'trace', 'parameters'].includes(
          child.getKey(),
        );
      });
    } else if (depth === 3 && key !== 'parameters') {
      return children.filter(child => {
        const key = child.getKey();
        return key === 'responses' || key === 'parameters';
      });
    }
    return children;
  }

  getLabel(node: Node): string {
    const depth = node.getDepth();

    if ((depth === 4 || depth === 5) && node.getParent().getKey() == 'parameters') {
      // return label for a parameter
      const ref = node.find('/$ref');
      const name = node.find('/name');
      const label = (ref && ref.getValue()) || (name && name.getValue());
      if (!label) {
        return '<unknown>';
      }
      return label;
    }
    return node.getKey();
  }

  getContextValue(node: Node) {
    if (node.getDepth() === 2) {
      return 'path';
    }
    return null;
  }
}

export class DefinitionOutlineProvider extends OutlineProvider {
  getRootPointer() {
    return '/definitions';
  }
}

export class SecurityDefinitionOutlineProvider extends OutlineProvider {
  getRootPointer() {
    return '/securityDefinitions';
  }
}

export class SecurityOutlineProvider extends OutlineProvider {
  getRootPointer() {
    return '/security';
  }

  getLabel(node: Node): string {
    const children = node.getChildren();
    return children[0].getKey();
  }
}

export class ComponentsOutlineProvider extends OutlineProvider {
  maxDepth = 3;
  getRootPointer() {
    return '/components';
  }
}

export class ServersOutlineProvider extends OutlineProvider {
  getRootPointer() {
    return '/servers';
  }

  getLabel(node: Node): string {
    for (const child of node.getChildren()) {
      if (child.getKey() === 'url') {
        const label = child.getValue();
        if (!label) {
          return '<unknown>';
        }
        return label;
      }
    }
    return '<unknown>';
  }
}

export class ParametersOutlineProvider extends OutlineProvider {
  getRootPointer() {
    return '/parameters';
  }
}

export class ResponsesOutlineProvider extends OutlineProvider {
  getRootPointer() {
    return '/responses';
  }
}

export class GeneralTwoOutlineProvider extends OutlineProvider {
  getChildren(node?: Node): Thenable<Node[]> {
    const targets = [
      '/swagger',
      '/host',
      '/basePath',
      '/info',
      '/schemes',
      '/consumes',
      '/produces',
      '/tags',
      '/externalDocs',
    ];

    const result = [];

    if (this.root) {
      for (const pointer of targets) {
        const node = this.root.find(pointer);
        if (node) {
          result.push(node);
        }
      }
    }

    return Promise.resolve(result);
  }
}

export class GeneralThreeOutlineProvider extends OutlineProvider {
  getChildren(node?: Node): Thenable<Node[]> {
    const targets = ['/openapi', '/info', '/tags', '/externalDocs'];

    const result = [];

    if (this.root) {
      for (const pointer of targets) {
        const node = this.root.find(pointer);
        if (node) {
          result.push(node);
        }
      }
    }
    return Promise.resolve(result);
  }
}

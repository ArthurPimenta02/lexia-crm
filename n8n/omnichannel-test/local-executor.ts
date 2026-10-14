// Minimal local interpreter for the generated OMNI v2 test workflows. It
// follows the n8n JSON (triggers, Code, IF, Execute Workflow and
// splitInBatches) so the same files that would be imported into a separate
// n8n test instance can be exercised here. It is not n8n: node semantics are
// limited to what these workflows use, and compatibility with a real n8n
// version still has to be confirmed in the authorized test environment.

import { createContext, Script } from "node:vm";

type Item = { json: Record<string, unknown> };
type N8nNode = { name: string; type: string; parameters: Record<string, unknown> };
type N8nWorkflow = {
  name: string;
  nodes: N8nNode[];
  connections: Record<string, { main: Array<Array<{ node: string; index: number }>> }>;
};

export type ExecutionLogEntry = { workflow: string; node: string; type: string; input_keys: string[] };

export class LocalN8nExecutor {
  readonly log: ExecutionLogEntry[] = [];
  private readonly staticData = new Map<string, Record<string, unknown>>();
  private readonly workflows = new Map<string, N8nWorkflow>();
  private steps = 0;

  constructor(workflows: N8nWorkflow[], private readonly maxSteps = 200_000) {
    for (const workflow of workflows) this.workflows.set(workflow.name, workflow);
  }

  async run(name: string, input: Item[] = [{ json: {} }]): Promise<Item[]> {
    const workflow = this.workflows.get(name);
    if (!workflow) throw new Error(`Workflow not found: ${name}`);
    const trigger = workflow.nodes.find((node) =>
      ["n8n-nodes-base.manualTrigger", "n8n-nodes-base.executeWorkflowTrigger"].includes(node.type),
    );
    if (!trigger) throw new Error(`No trigger in ${name}`);

    const loopState = new Map<string, { pending: Item[]; processed: Item[] }>();
    let lastOutput: Item[] = [];
    const stack: Array<{ node: string; items: Item[] }> = [];

    const emit = (from: string, outputs: Item[][]) => {
      const targets = workflow.connections[from]?.main ?? [];
      // Depth-first like n8n v1: later outputs are pushed first.
      for (let index = outputs.length - 1; index >= 0; index -= 1) {
        const items = outputs[index] ?? [];
        if (items.length === 0) continue;
        for (const target of [...(targets[index] ?? [])].reverse()) {
          stack.push({ node: target.node, items });
        }
      }
    };

    lastOutput = trigger.type === "n8n-nodes-base.manualTrigger" ? [{ json: {} }] : input;
    this.record(workflow.name, trigger, lastOutput);
    emit(trigger.name, [lastOutput]);

    while (stack.length > 0) {
      if (++this.steps > this.maxSteps) throw new Error("Execution step limit reached");
      const { node: nodeName, items } = stack.pop()!;
      const node = workflow.nodes.find((candidate) => candidate.name === nodeName);
      if (!node) throw new Error(`Missing node ${nodeName} in ${workflow.name}`);
      this.record(workflow.name, node, items);
      const outputs = await this.execute(workflow, node, items, loopState);
      const produced = outputs.find((output) => output.length > 0);
      if (produced) lastOutput = produced;
      emit(node.name, outputs);
    }
    return lastOutput;
  }

  getStaticData(workflowName: string) {
    return this.staticData.get(workflowName) ?? {};
  }

  private record(workflow: string, node: N8nNode, items: Item[]) {
    this.log.push({
      workflow,
      node: node.name,
      type: node.type,
      input_keys: Object.keys(items[0]?.json ?? {}).sort(),
    });
  }

  private async execute(
    workflow: N8nWorkflow,
    node: N8nNode,
    items: Item[],
    loopState: Map<string, { pending: Item[]; processed: Item[] }>,
  ): Promise<Item[][]> {
    switch (node.type) {
      case "n8n-nodes-base.code":
        return [await this.runCode(workflow, node, items)];
      case "n8n-nodes-base.if": {
        const conditions = (node.parameters.conditions as { conditions: Array<{ leftValue: string }> }).conditions;
        const expression = conditions[0]!.leftValue.replace(/^=\{\{\s*/, "").replace(/\s*\}\}$/, "");
        const test = new Function("$json", `return (${expression});`) as (json: unknown) => unknown;
        const truthy: Item[] = [];
        const falsy: Item[] = [];
        for (const item of items) (test(item.json) === true ? truthy : falsy).push(item);
        return [truthy, falsy];
      }
      case "n8n-nodes-base.executeWorkflow": {
        const target = (node.parameters.workflowId as { cachedResultName: string }).cachedResultName;
        return [await this.run(target, structuredClone(items))];
      }
      case "n8n-nodes-base.splitInBatches": {
        let state = loopState.get(node.name);
        if (!state) {
          state = { pending: [...items], processed: [] };
          loopState.set(node.name, state);
        } else {
          state.processed.push(...items);
        }
        const next = state.pending.shift();
        if (next) return [[], [next]];
        loopState.delete(node.name);
        return [state.processed, []];
      }
      default:
        throw new Error(`Unsupported node type in local executor: ${node.type}`);
    }
  }

  private async runCode(workflow: N8nWorkflow, node: N8nNode, items: Item[]): Promise<Item[]> {
    const staticData = this.staticData.get(workflow.name) ?? {};
    this.staticData.set(workflow.name, staticData);
    // Sandbox without require, process or Node globals, closer to n8n.
    const sandbox = createContext({
      $input: { all: () => items, first: () => items[0], last: () => items[items.length - 1] },
      items,
      $getWorkflowStaticData: () => staticData,
      __result: undefined as unknown,
    });
    const source = `__result = (async () => {\n${String(node.parameters.jsCode)}\n})();`;
    new Script(source, { filename: `${workflow.name}/${node.name}.js` }).runInContext(sandbox);
    const result = (await sandbox.__result) as Item[];
    if (!Array.isArray(result)) throw new Error(`Code node ${node.name} must return an array`);
    // Data crossing node boundaries is plain JSON in n8n.
    return JSON.parse(JSON.stringify(result));
  }
}

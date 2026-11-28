/** In-memory stand-in for the hub's /ops and /sync routes, used by sync
 *  conflict tests. It mirrors last-write-wins and the `{ applied, cursor }`
 *  reply; it never edits the logged row when a page is read. */

import type { HubOp, PullResult, PullRow, PullTable, PushResult } from "../storage/hub";
import { isNewerRow } from "./queue";

export class FakeHub {
  private readonly rows = new Map<string, PullRow>();
  private readonly log: Array<{ seq: number; table: PullTable; row: PullRow }> = [];
  private seq = 0;
  private failNext = 0;

  readonly pushes: HubOp[][] = [];
  readonly pulls: number[] = [];

  constructor(private readonly pageSize = 500) {}

  get cursor(): number {
    return this.seq;
  }

  seed(op: HubOp): void {
    this.write(op);
  }

  get(table: PullTable, id: string): PullRow | undefined {
    return this.rows.get(`${table}:${id}`);
  }

  offline(times = 1): void {
    this.failNext = times;
  }

  push = async (ops: HubOp[]): Promise<PushResult> => {
    this.pushes.push(ops);
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw new Error("offline");
    }
    let applied = 0;
    for (const op of ops) {
      const key = `${op.table}:${op.row.id}`;
      const current = this.rows.get(key);
      if (current && isNewerRow(current, op.row)) continue;
      this.write(op);
      applied += 1;
    }
    return { applied, cursor: this.seq };
  };

  pull = async (since = 0): Promise<PullResult> => {
    this.pulls.push(since);
    const entries = this.log.filter((entry) => entry.seq > since).sort((a, b) => a.seq - b.seq);
    const more = entries.length > this.pageSize;
    const page = more ? entries.slice(0, this.pageSize) : entries;
    const changes = page.map((entry) => ({
      table: entry.table,
      row: this.rows.get(`${entry.table}:${entry.row.id}`)!,
    }));
    const cursor = page.length ? page[page.length - 1].seq : since;
    return { changes, cursor, more };
  };

  private write(op: HubOp): void {
    const key = `${op.table}:${op.row.id}`;
    this.rows.set(key, op.row);
    this.seq += 1;
    this.log.push({ seq: this.seq, table: op.table, row: op.row });
  }
}

import { spawnSync } from "node:child_process"
import { mkdtempSync, writeFileSync } from "node:fs"
import { tmpdir } from "node:os"
import { join } from "node:path"
import { describe, expect, it } from "vitest"
import { emitQuery } from "../src"
import { WEEKS, cases, dataset, expected } from "./fixtures"

/**
 * BigQuery and Snowflake can't run here, so with a Python that has sqlglot and duckdb
 * (SQLGLOT_PYTHON=/path/to/python) each query is parsed in its own dialect by sqlglot,
 * transpiled to DuckDB and run on the fixture events, and the numbers are checked.
 * Without it the test is skipped; node-sql-parser still parses both dialects in query.test.ts.
 */

const python = process.env.SQLGLOT_PYTHON

describe.skipIf(!python)("BigQuery and Snowflake, parsed by sqlglot and run in DuckDB", () => {
  it("returns the expected numbers for every compiled shape", () => {
    const now = new Date()
    const evs = dataset(now)
    const input = {
      events: evs.map((e) => ({
        event_name: e.event,
        occurred_at: e.ts.toISOString(),
        user_id: e.user,
        session_id: e.session,
        properties: JSON.stringify(e.props),
      })),
      cases: Object.fromEntries(
        Object.entries(cases).map(([k, s]) => [
          k,
          {
            bigquery: emitQuery(s, "bigquery", { weeks: WEEKS }),
            snowflake: emitQuery(s, "snowflake", { weeks: WEEKS }),
            expected: expected(s, evs, now),
          },
        ])
      ),
    }
    const file = join(mkdtempSync(join(tmpdir(), "wq-")), "cases.json")
    writeFileSync(file, JSON.stringify(input))
    const res = spawnSync(python!, ["-I", join(import.meta.dirname, "warehouse_check.py"), file], { encoding: "utf8" })
    expect(res.status, res.stderr).toBe(0)
    const out = JSON.parse(res.stdout) as { ok: number; problems: string[] }
    expect(out.problems).toEqual([])
    expect(out.ok).toBe(Object.keys(cases).length * 2)
  }, 120_000)
})

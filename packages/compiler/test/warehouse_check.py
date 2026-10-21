"""Parse BigQuery and Snowflake queries with sqlglot, transpile them to DuckDB, run them on the
fixture events and compare with the expected rows. Input: a JSON file from query.warehouse.test.ts.
Prints one JSON object: {"ok": n, "problems": [...]}."""

import json
import math
import re
import sys

import duckdb
import sqlglot

data = json.load(open(sys.argv[1]))
con = duckdb.connect()
con.execute("SET TimeZone='UTC'")  # BigQuery's CURRENT_DATE() is UTC by default
con.execute("CREATE TABLE events (event_name VARCHAR, occurred_at TIMESTAMP, user_id VARCHAR, session_id VARCHAR, properties JSON)")
con.executemany(
    "INSERT INTO events VALUES (?, CAST(? AS TIMESTAMPTZ) AT TIME ZONE 'UTC', ?, ?, ?)",
    [(e["event_name"], e["occurred_at"], e["user_id"], e["session_id"], e["properties"]) for e in data["events"]],
)

ok = 0
problems = []
for name, case in data["cases"].items():
    for dialect in ("bigquery", "snowflake"):
        sql = case[dialect]
        try:
            sqlglot.parse_one(sql, read=dialect, error_level=sqlglot.ErrorLevel.RAISE)
        except Exception as e:  # noqa: BLE001
            problems.append(f"parse {dialect} {name}: {e}")
            continue
        duck = sqlglot.transpile(sql, read=dialect, write="duckdb")[0]
        # sqlglot writes Snowflake's VARIANT::string as CAST(json AS TEXT), which keeps the JSON quotes
        # in DuckDB; Snowflake unquotes. Read it the way Snowflake does.
        duck = re.sub(r"CAST\(properties -> ('[^']*') AS TEXT\)", r"(properties ->> \1)", duck)
        # DuckDB's clock stands in for the warehouse's; both are UTC-cut by the query itself.
        try:
            rows = con.execute(duck).fetchall()
        except Exception as e:  # noqa: BLE001
            problems.append(f"run {dialect} {name}: {str(e).splitlines()[0]}")
            continue
        cols = [d[0] for d in con.description]
        want = case["expected"]
        if len(rows) != len(want):
            problems.append(f"{dialect} {name}: {len(rows)} rows, expected {len(want)}")
            continue
        bad = False
        for r, w in zip(rows, want):
            r = dict(zip(cols, r))
            if str(r["week"])[:10] != w["week"]:
                bad = True
            for k in ("numerator", "subtract", "denominator", "value"):
                if k not in w:
                    continue
                a, b = r.get(k), w[k]
                if b is None:
                    bad = bad or a is not None
                elif a is None or not math.isclose(float(a), float(b), rel_tol=1e-9, abs_tol=1e-9):
                    bad = True
        if bad:
            problems.append(f"{dialect} {name}: numbers differ")
        else:
            ok += 1

print(json.dumps({"ok": ok, "problems": problems}))

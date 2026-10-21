"""Parse hand-written BigQuery and Snowflake queries with sqlglot in their own dialect, transpile them
to DuckDB and run them on the events. Input: a JSON file from handwritten.fixtures.ts.
Prints one JSON object: {key: {"rows": [...]} or {"error": "..."}}."""

import datetime
import decimal
import json
import re
import sys

import duckdb
import sqlglot
from sqlglot import exp

data = json.load(open(sys.argv[1]))
con = duckdb.connect()
con.execute("SET TimeZone='UTC'")  # BigQuery's CURRENT_DATE() and Snowflake's SYSDATE() are UTC
con.execute("CREATE TABLE events (event_name VARCHAR, occurred_at TIMESTAMP, user_id VARCHAR, session_id VARCHAR, properties JSON)")
con.executemany(
    "INSERT INTO events VALUES (?, CAST(? AS TIMESTAMPTZ) AT TIME ZONE 'UTC', ?, ?, ?)",
    [(e["event_name"], e["occurred_at"], e["user_id"], e["session_id"], e["properties"]) for e in data["events"]],
)


def plain(v):
    if isinstance(v, (datetime.date, datetime.datetime)):
        return v.isoformat()[:10]
    if isinstance(v, decimal.Decimal):
        return float(v)
    return v


out = {}
for case in data["cases"]:
    key, dialect, sql = case["key"], case["dialect"], case["sql"]
    try:
        tree = sqlglot.parse_one(sql, read=dialect, error_level=sqlglot.ErrorLevel.RAISE)
    except Exception as e:  # noqa: BLE001
        out[key] = {"error": f"parse: {str(e).splitlines()[0]}"}
        continue
    # BigQuery's COUNTIF over rows that are all NULL is 0; DuckDB's COUNT_IF is NULL. Count only TRUE.
    tree = tree.transform(
        lambda n: exp.CountIf(this=exp.Is(this=exp.paren(n.this), expression=exp.true())) if isinstance(n, exp.CountIf) else n
    )
    duck = tree.sql(dialect="duckdb")
    # sqlglot writes Snowflake's VARIANT::string as CAST(json AS TEXT), which keeps the JSON quotes
    # in DuckDB; Snowflake unquotes. Read it the way Snowflake does.
    duck = re.sub(r"CAST\(((?:\w+\.)?properties) -> ('[^']*') AS TEXT\)", r"(\1 ->> \2)", duck)
    try:
        cur = con.execute(duck)
        cols = [d[0] for d in cur.description]
        out[key] = {"rows": [{c: plain(v) for c, v in zip(cols, r)} for r in cur.fetchall()]}
    except Exception as e:  # noqa: BLE001
        out[key] = {"error": f"run: {str(e).splitlines()[0]}\n{duck}"}

print(json.dumps(out))

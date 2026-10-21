/** A tiny SQL tokenizer for highlighting query blocks: comments, strings, numbers, keywords, functions. */

export type SqlTokenType = "comment" | "string" | "number" | "keyword" | "function" | "ident" | "punct" | "space"

export interface SqlToken {
  type: SqlTokenType
  text: string
}

const KEYWORDS = new Set(
  (
    "select from where and or not in is null as on join inner left right full outer cross group by order having limit with " +
    "distinct case when then else end between like ilike exists union all asc desc over partition qualify filter interval " +
    "true false using lateral within table values into"
  ).split(" "),
)

const RULES: [SqlTokenType, RegExp][] = [
  ["space", /^\s+/],
  ["comment", /^--[^\n]*/],
  ["string", /^'(?:[^'\\]|\\.|'')*'?/],
  ["string", /^"(?:[^"\\]|\\.)*"?/],
  ["ident", /^`[^`]*`?/],
  ["number", /^\d+(?:\.\d+)?\b/],
  ["ident", /^[$A-Za-z_][$A-Za-z0-9_]*/],
  ["punct", /^(?:::|->>|->|>=|<=|!=|<>|=>|[(),.;*+\-/<>=:[\]{}%|])/],
]

export function tokenizeSql(sql: string): SqlToken[] {
  const out: SqlToken[] = []
  let rest = sql
  while (rest.length) {
    let matched = false
    for (const [type, re] of RULES) {
      const m = re.exec(rest)
      if (!m) continue
      const text = m[0]
      let t: SqlTokenType = type
      if (type === "ident" && !text.startsWith("`")) {
        if (KEYWORDS.has(text.toLowerCase())) t = "keyword"
        else if (/^\s*\(/.test(rest.slice(text.length))) t = "function"
      }
      const prev = out.at(-1)
      if (prev && prev.type === t && (t === "space" || t === "punct")) prev.text += text
      else out.push({ type: t, text })
      rest = rest.slice(text.length)
      matched = true
      break
    }
    if (!matched) {
      out.push({ type: "punct", text: rest[0]! })
      rest = rest.slice(1)
    }
  }
  return out
}

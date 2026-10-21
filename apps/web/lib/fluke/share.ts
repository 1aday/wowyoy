import type { FlukeUnit } from "@workspace/metrics"

/** Values back into the text a person would paste, for links that reproduce a result. */
export function serialize(values: number[], unit: FlukeUnit) {
  return values
    .map((v) =>
      unit === "$"
        ? `$${v.toLocaleString("en-US", { maximumFractionDigits: 2 })}`
        : `${v.toLocaleString("en-US", { maximumFractionDigits: 4 })}${unit}`,
    )
    .join(", ")
}

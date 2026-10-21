import { readWatched } from "./data"
import { WATCHED } from "./seed"
import { movesOf, type MoveView } from "./view"

/** The /gh/moves.json feed: last week's real moves in the watched repos. */
export interface MovesFeed {
  week: { id: string; monday: string; sunday: string }
  watched: number
  /** Repos read this time. */
  read: number
  missing: number
  moves: MoveView[]
  generatedAt: string
}

export async function movesFeed(): Promise<MovesFeed> {
  const { week, pulses, missing } = await readWatched()
  return {
    week: { id: week.id, monday: week.monday, sunday: week.sunday },
    watched: WATCHED.length,
    read: pulses.length,
    missing,
    // Alphabetical by repo (readWatched sorts), measures in their own order.
    moves: pulses.flatMap(movesOf),
    generatedAt: new Date().toISOString(),
  }
}

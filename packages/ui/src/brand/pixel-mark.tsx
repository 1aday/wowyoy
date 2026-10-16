/** One 9×9 ink pictogram per library category. Whole screen pixels only: 18, 27, 36, 72px. */

export const pixelMarks = {
  executive: [".........", "###.#####", ".........", "###.###..", ".........", "###.####.", ".........", "###.##...", "........."],
  health: ["...#.....", "...#.....", "..#.#....", "..#.#....", "##...#..#", ".....#.#.", ".....#.#.", "......#..", "........."],
  acquisition: [".....####", "........#", "...#....#", "....#...#", "#######.#", "....#...#", "...#....#", "........#", ".....####"],
  conversion: ["#########", ".........", ".#######.", ".........", "..#####..", ".........", "...###...", ".........", "....#...."],
  retention: ["#.#.#.#.#", ".........", "#.#.#.#..", ".........", "#.#.#....", ".........", "#.#......", ".........", "#........"],
  unit: ["....#....", "..#####..", ".#..#....", ".#..#....", "..#####..", "....#..#.", "....#..#.", "..#####..", "....#...."],
  experiments: ["..#####..", "...#.#...", "...#.#...", "..#...#..", ".#.....#.", "#.......#", "#########", "#########", "........."],
  planning: ["#########", "#.......#", "#.#####.#", "#.#...#.#", "#.#.#.#.#", "#.#...#.#", "#.#####.#", "#.......#", "#########"],
  calculators: [".#.......", "###...###", ".#.......", ".........", ".........", ".........", "#.#...###", ".#.......", "#.#...###"],
  playbooks: [".#######.", ".#.....#.", ".#.###.#.", ".#.....#.", ".#.###.#.", ".#.....#.", ".#.##..#.", ".#.....#.", ".#######."],
} as const

export type PixelMarkName = keyof typeof pixelMarks

export const pixelMarkNames: Record<PixelMarkName, string> = {
  executive: "Executive",
  health: "Health and monitors",
  acquisition: "Acquisition",
  conversion: "Conversion",
  retention: "Retention",
  unit: "Unit economics",
  experiments: "Experimentation",
  planning: "Planning",
  calculators: "Calculators",
  playbooks: "Playbooks",
}

export function PixelMark({ name, size = 18, className }: { name: PixelMarkName; size?: 18 | 27 | 36 | 72; className?: string }) {
  const cells: [number, number][] = []
  pixelMarks[name].forEach((row, y) => {
    for (let x = 0; x < 9; x++) if (row[x] === "#") cells.push([x, y])
  })
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 9 9"
      role="img"
      aria-label={pixelMarkNames[name]}
      className={className}
      style={{ shapeRendering: "crispEdges" }}
      fill="currentColor"
    >
      {cells.map(([x, y]) => (
        <rect key={`${x}-${y}`} x={x} y={y} width={1} height={1} />
      ))}
    </svg>
  )
}

export const MAZE_ROWS = [
  "###################",
  "#........#........#",
  "#o##.###.#.###.##o#",
  "#.................#",
  "#.##.#.#####.#.##.#",
  "#....#...#...#....#",
  "####.###.#.###.####",
  "#........ ........#",
  "#.####.##=##.####.#",
  "#......#GGG#......#",
  "####.#.#####.#.####",
  "#....#.......#....#",
  "#.##.#.#####.#.##.#",
  "#o.#...........#.o#",
  "##.#.#.##.##.#.#.##",
  "#....#...#...#....#",
  "#.######.#.######.#",
  "#.................#",
  "#.##.###.#.###.##.#",
  "#.................#",
  "###################",
];

export const MAZE_W = 19;
export const MAZE_H = 21;

export type TileKind = "#" | "." | "o" | "=" | "G" | " ";

export const tileAt = (x: number, y: number): TileKind => {
  if (x < 0 || x >= MAZE_W || y < 0 || y >= MAZE_H) return "#";
  return MAZE_ROWS[y][x] as TileKind;
};

export const isWall = (x: number, y: number) => tileAt(x, y) === "#";
export const isDoor = (x: number, y: number) => tileAt(x, y) === "=";
export const isHouse = (x: number, y: number) => tileAt(x, y) === "G";

export const PAC_START = { x: 9, y: 17 };
export const HOUSE_DOOR = { x: 9, y: 8 };
export const HOUSE_EXIT = { x: 9, y: 7 };
export const GHOST_HOME = [
  { x: 8, y: 9 },
  { x: 9, y: 9 },
  { x: 10, y: 9 },
  { x: 8, y: 9 },
];

export const SCATTER_CORNERS = [
  { x: 17, y: 1 },
  { x: 1, y: 1 },
  { x: 17, y: 19 },
  { x: 1, y: 19 },
];

export type Dir = "up" | "down" | "left" | "right";

export const DIRS: Record<Dir, { x: number; y: number }> = {
  up: { x: 0, y: -1 },
  down: { x: 0, y: 1 },
  left: { x: -1, y: 0 },
  right: { x: 1, y: 0 },
};

export const OPPOSITE: Record<Dir, Dir> = {
  up: "down",
  down: "up",
  left: "right",
  right: "left",
};

export const ALL_DIRS: Dir[] = ["up", "left", "down", "right"];

export const canWalk = (x: number, y: number, ghost = false) => {
  const t = tileAt(x, y);
  if (t === "#") return false;
  if (t === "=") return ghost;
  return true;
};

export const initialPellets = () => {
  const pellets = new Set<string>();
  let power = 0;
  for (let y = 0; y < MAZE_H; y++) {
    for (let x = 0; x < MAZE_W; x++) {
      const t = tileAt(x, y);
      if (t === ".") pellets.add(`${x},${y}`);
      if (t === "o") {
        pellets.add(`${x},${y}`);
        power++;
      }
    }
  }
  return { pellets, total: pellets.size, power };
};

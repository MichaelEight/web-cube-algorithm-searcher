// Named-algorithm recognizer. Matches an exact move-name sequence to a known name, per cube size.

type AlgList = Array<[readonly string[], string]>

const KNOWN_3x3: AlgList = [
  [['R', 'U', "R'", "U'"], 'Sexy move'],
  [["L'", "U'", 'L', 'U'], 'Sexy (L variant)'],
  [["R'", 'F', 'R', "F'"], 'Sledgehammer'],
  [['R', 'U', "R'"], "Trigger (R U R')"],
  [['F', 'R', 'U', "R'", "U'", "F'"], 'OLL cross'],
  [['Fw', 'R', 'U', "R'", "U'", "Fw'"], 'OLL cross (wide)'],
  [['R', 'U', "R'", 'U', 'R', 'U2', "R'"], 'Sune'],
  [['R', 'U2', "R'", "U'", 'R', "U'", "R'"], 'Antisune'],
  [['R', 'U', "R'", "U'", "R'", 'F', 'R', "F'"], 'OLL 45 / Fat sune derivative'],
  [['R', 'U', "R'", "U'", "R'", 'F', 'R2', "U'", "R'", "U'", 'R', 'U', "R'", "F'"], 'T-perm'],
  [['R', "U'", 'R', 'U', 'R', 'U', 'R', "U'", "R'", "U'", 'R2'], 'Ua-perm'],
  [['R2', 'U', 'R', 'U', "R'", "U'", "R'", "U'", "R'", 'U', "R'"], 'Ub-perm'],
  [["R'", 'U', "L'", 'U2', 'R', "U'", 'L', "R'", 'U', "L'", 'U2', 'R', "U'", 'L'], 'E-perm'],
  [["R'", 'U', "R'", "U'", 'y', "R'", "F'", 'R2', "U'", "R'", 'U', "R'", 'F', 'R', 'F'], 'Ja-perm variant'],
  [['R', 'U', "R'", "F'", 'R', 'U', "R'", "U'", "R'", 'F', 'R2', "U'", "R'"], 'Jb-perm'],
  [['F', 'R', "U'", "R'", "U'", 'R', 'U', "R'", "F'", 'R', 'U', "R'", "U'", "R'", 'F', 'R', "F'"], 'Y-perm'],
  [['R', 'U2', "R'", "U'", 'R', 'U2', "L'", 'U', "R'", "U'", 'L'], 'Ga-perm (Anti-Ga sim)'],
  [['U', 'R', "U'", "R'"], 'F2L insert (front slot)'],
  [['R', "U'", "R'"], "Trigger (R U' R')"],
]

const KNOWN_2x2: AlgList = [
  [['R', 'U', "R'", "U'"], 'Sexy move'],
  [['R', 'U', "R'", 'U', 'R', 'U2', "R'"], 'Sune'],
  [['R', 'U2', "R'", "U'", 'R', "U'", "R'"], 'Antisune'],
  [['F', 'R', 'U', "R'", "U'", "F'"], 'OLL cross / T-OLL'],
  [["R'", 'F', 'R', "F'"], 'Sledgehammer'],
]

const KNOWN_4x4: AlgList = [
  [['R', 'U', "R'", "U'"], 'Sexy move'],
  [['R', 'U', "R'", 'U', 'R', 'U2', "R'"], 'Sune'],
  [["Rw", 'U', "Rw'", 'U', "Rw", 'U2', "Rw'"], 'Centers Sune (wide)'],
]

const ALGS_BY_SIZE: Record<number, AlgList> = {
  2: KNOWN_2x2,
  3: KNOWN_3x3,
  4: KNOWN_4x4,
}

function eq(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function lookup(N: number, names: readonly string[]): string | null {
  const list = ALGS_BY_SIZE[N] ?? []
  for (const [seq, label] of list) {
    if (eq(seq, names)) return label
  }
  return null
}

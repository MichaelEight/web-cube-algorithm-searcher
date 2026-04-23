// Named-algorithm recognizer. Matches an exact move-name sequence to a known name.

const KNOWN: Array<[readonly string[], string]> = [
  [['R', 'U', "R'", "U'"], 'Sexy move'],
  [["L'", "U'", 'L', 'U'], 'Sexy (L variant)'],
  [["R'", 'F', 'R', "F'"], 'Sledgehammer'],
  [['R', 'U', "R'"], "Trigger (R U R')"],
  [['F', 'R', 'U', "R'", "U'", "F'"], 'OLL cross'],
  [['f', 'R', 'U', "R'", "U'", "f'"], 'OLL cross (wide)'],
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
  [['U', 'R', "U'", "R'"], 'F2L insert (back slot)'],
  [['R', "U'", "R'"], "Trigger (R U' R')"],
]

function eq(a: readonly string[], b: readonly string[]): boolean {
  if (a.length !== b.length) return false
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false
  return true
}

export function lookup(names: readonly string[]): string | null {
  for (const [seq, label] of KNOWN) {
    if (eq(seq, names)) return label
  }
  return null
}

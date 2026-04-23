// User-named algorithm library.
const KEY = 'cube-alg-search:user-algs'

export function loadAll(): Record<string, string[]> {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return {}
    const data = JSON.parse(raw) as unknown
    if (!data || typeof data !== 'object') return {}
    const out: Record<string, string[]> = {}
    for (const [k, v] of Object.entries(data as Record<string, unknown>)) {
      if (Array.isArray(v) && v.every((x) => typeof x === 'string')) {
        out[k] = v as string[]
      }
    }
    return out
  } catch {
    return {}
  }
}

function write(data: Record<string, string[]>): void {
  localStorage.setItem(KEY, JSON.stringify(data))
}

export function saveAlg(name: string, moveNames: string[]): void {
  const data = loadAll()
  data[name] = [...moveNames]
  write(data)
}

export function deleteAlg(name: string): void {
  const data = loadAll()
  if (name in data) {
    delete data[name]
    write(data)
  }
}

export function lookup(moveNames: readonly string[]): string | null {
  const target = moveNames.join('|')
  const data = loadAll()
  for (const [name, seq] of Object.entries(data)) {
    if (seq.join('|') === target) return name
  }
  return null
}

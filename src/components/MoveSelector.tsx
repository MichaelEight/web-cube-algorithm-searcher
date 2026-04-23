import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { CubeSpec, Move, MoveCategory } from "../cube/cube";

export type MoveToggles = Record<string, boolean>;

interface Props {
  cube: CubeSpec;
  toggles: MoveToggles;
  setToggles: (t: MoveToggles) => void;
}

interface CategorySpec {
  key: MoveCategory;
  label: string;
  faces: string[];
  twoColumns: boolean;
}

function buildCategories(cube: CubeSpec): CategorySpec[] {
  const out: CategorySpec[] = []
  out.push({ key: 'htm', label: 'HTM', faces: [...cube.HTM_FACES], twoColumns: true })
  if (cube.WIDE_FACES.length) {
    out.push({ key: 'wide', label: 'Wide', faces: [...cube.WIDE_FACES], twoColumns: true })
  }
  if (cube.SLICE_FACES.length) {
    out.push({ key: 'slice', label: 'Slice', faces: [...cube.SLICE_FACES], twoColumns: false })
  }
  out.push({ key: 'rotation', label: 'Rotations', faces: [...cube.ROT_FACES], twoColumns: false })
  return out
}

export function buildDefaultToggles(cube: CubeSpec): MoveToggles {
  const t: MoveToggles = {};
  for (const m of cube.ALL_MOVES) t[m.name] = m.category === "htm";
  return t;
}

interface CategoryCardProps {
  spec: CategorySpec;
  toggles: MoveToggles;
  setToggles: (t: MoveToggles) => void;
  startPaint: (name: string) => void;
}

function CategoryCard({
  spec,
  toggles,
  setToggles,
  startPaint,
}: CategoryCardProps) {
  const headerRef = useRef<HTMLInputElement>(null);
  const faceNames = spec.faces.flatMap((f) => ["", "'", "2"].map((s) => f + s));
  const onCount = faceNames.filter((n) => toggles[n]).length;
  const allOn = onCount === faceNames.length;
  const partialOn = onCount > 0 && !allOn;
  if (headerRef.current) headerRef.current.indeterminate = partialOn;

  const toggleAll = () => {
    const next = { ...toggles };
    const target = !allOn;
    for (const n of faceNames) next[n] = target;
    setToggles(next);
  };

  return (
    <div className="cat-card">
      <label className="cat-header">
        <input
          ref={headerRef}
          type="checkbox"
          checked={allOn}
          onChange={toggleAll}
        />
        <strong>{spec.label}</strong>
        <span className="cat-count">
          {onCount}/{faceNames.length}
        </span>
      </label>
      <div className={`face-grid${spec.twoColumns ? " cols-2" : ""}`}>
        {spec.faces.map((face) => (
          <div className="face-group" key={face}>
            {["", "'", "2"].map((suffix) => {
              const name = face + suffix;
              return (
                <button
                  key={name}
                  type="button"
                  data-move-name={name}
                  className={`move-pill${toggles[name] ? " on" : ""}`}
                  onPointerDown={(e) => {
                    e.preventDefault();
                    startPaint(name);
                  }}
                  onContextMenu={(e) => e.preventDefault()}
                >
                  {name}
                </button>
              );
            })}
          </div>
        ))}
      </div>
    </div>
  );
}

export function MoveSelector({ cube, toggles, setToggles }: Props) {
  const togglesRef = useRef(toggles);
  togglesRef.current = toggles;
  const setTogglesRef = useRef(setToggles);
  setTogglesRef.current = setToggles;

  const paintRef = useRef<boolean | null>(null);
  const startNameRef = useRef<string | null>(null);
  const rafRef = useRef<number | null>(null);
  const lastPointerRef = useRef<{ x: number; y: number } | null>(null);
  const [, force] = useState(0);

  const categories = useMemo(() => buildCategories(cube), [cube])

  const applyPill = useCallback((name: string, val: boolean) => {
    const cur = togglesRef.current;
    if (cur[name] === val) return;
    const next = { ...cur, [name]: val };
    togglesRef.current = next;
    setTogglesRef.current(next);
  }, []);

  const processMove = useCallback(() => {
    rafRef.current = null;
    const paintVal = paintRef.current;
    const pos = lastPointerRef.current;
    if (paintVal === null || !pos) return;
    const el = document.elementFromPoint(pos.x, pos.y) as HTMLElement | null;
    if (!el) return;
    const pill = el.closest(".move-pill") as HTMLElement | null;
    if (!pill) return;
    const name = pill.getAttribute("data-move-name");
    if (!name) return;
    applyPill(name, paintVal);
  }, [applyPill]);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (paintRef.current === null) return;
      lastPointerRef.current = { x: e.clientX, y: e.clientY };
      if (rafRef.current === null)
        rafRef.current = requestAnimationFrame(processMove);
    };
    const onUp = () => {
      paintRef.current = null;
      startNameRef.current = null;
      if (rafRef.current !== null) {
        cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      }
      force((v) => v + 1);
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [processMove]);

  const startPaint = useCallback(
    (name: string) => {
      const cur = togglesRef.current;
      const newVal = !cur[name];
      applyPill(name, newVal);
      paintRef.current = newVal;
      startNameRef.current = name;
    },
    [applyPill],
  );

  const availableFaces = useMemo(() => new Set(cube.ALL_MOVES.map((m: Move) => m.name.replace(/['2]$/, ''))), [cube])

  const preset = (faceLetters: string[]) => {
    const allowed = faceLetters.filter((f) => availableFaces.has(f))
    const next = { ...toggles };
    for (const m of cube.ALL_MOVES) {
      const base = m.name.replace(/['2]$/, "");
      next[m.name] = allowed.includes(base);
    }
    setToggles(next);
  };

  const presetDoubles = () => {
    const next: MoveToggles = {};
    for (const m of cube.ALL_MOVES) {
      next[m.name] = m.name.endsWith('2') && (m.category === 'htm' || m.category === 'slice')
    }
    setToggles(next);
  };

  const presetAll = () => {
    const next: MoveToggles = {};
    for (const m of cube.ALL_MOVES) next[m.name] = true;
    setToggles(next);
  };

  const presetNone = () => {
    const next: MoveToggles = {};
    for (const m of cube.ALL_MOVES) next[m.name] = false;
    setToggles(next);
  };

  return (
    <div className="panel move-selector-panel">
      <div className="panel-title">Allowed moves</div>

      <div className="presets-row">
        <span className="presets-label">Presets:</span>
        <button onClick={presetNone}>NONE</button>
        <button onClick={presetAll}>ALL</button>
        <button onClick={() => preset(["R", "U"])}>R U</button>
        <button onClick={() => preset(["R", "U", "F"])}>R U F</button>
        <button onClick={() => preset(["R", "U", "L"])}>R U L</button>
        <button onClick={() => preset(["R", "U", "L", "F"])}>R U L F</button>
        {cube.SLICE_FACES.length > 0 && (
          <button onClick={() => preset(["M", "U"])}>M U</button>
        )}
        <button onClick={() => preset(["U", "D", "L", "R", "F", "B"])}>
          All HTM
        </button>
        <button onClick={presetDoubles}>Doubles only</button>
      </div>

      <div className="categories-grid">
        {categories.map((spec) => (
          <CategoryCard
            key={spec.key}
            spec={spec}
            toggles={toggles}
            setToggles={setToggles}
            startPaint={startPaint}
          />
        ))}
      </div>
    </div>
  );
}

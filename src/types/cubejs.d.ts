declare module '*vendor/cubejs/index.js' {
  interface CubeInstance {
    solve(maxDepth?: number): string
    asString(): string
    isSolved(): boolean
    move(algorithm: string): CubeInstance
  }

  interface CubeConstructor {
    new (): CubeInstance
    fromString(str: string): CubeInstance
    initSolver(): void
    random(): CubeInstance
    inverse(algorithm: string): string
  }

  const Cube: CubeConstructor
  export default Cube
}

import { describe, expect, it } from 'vitest'
import path from 'node:path'
import { parseDslFile } from './parse.js'
import { validateCanonicalAst } from './validate.js'
import { compilePetrinetTransitions } from './compile-petrinet.js'
import { compileGameSystemTransitions } from './compile-game-system.js'
import { compileMetadata } from './metadata.js'

const REPO_ROOT = process.cwd()
const CANONICAL_DSL = path.join(REPO_ROOT, 'docs', 'lunar-chemistry-petrinet.dsl')

describe('DSL compiler', () => {
  it('parses + validates canonical DSL', () => {
    const ast = parseDslFile(CANONICAL_DSL)
    expect(() => validateCanonicalAst(ast)).not.toThrow()
  })

  it('compiles petrinet with derived drains', () => {
    const ast = parseDslFile(CANONICAL_DSL)
    validateCanonicalAst(ast)

    const transitions = compilePetrinetTransitions(ast)
    expect(transitions.some(t => t.id === 'init')).toBe(true)
    expect(transitions.some(t => t.id === 'launch')).toBe(true)
    expect(transitions.some(t => t.id === 'terminate')).toBe(true)

    // drains are derived
    expect(transitions.some(t => t.id.startsWith('drain__'))).toBe(true)
  })

  it('compiles game-system layered model', () => {
    const ast = parseDslFile(CANONICAL_DSL)
    validateCanonicalAst(ast)

    const transitions = compileGameSystemTransitions(ast)

    expect(transitions.some(t => t.id.startsWith('convey__'))).toBe(true)
    expect(transitions.some(t => t.id.startsWith('store__'))).toBe(true)
    expect(transitions.some(t => t.id.startsWith('recipe__'))).toBe(true)
    expect(transitions.some(t => t.id.startsWith('extract__'))).toBe(true)
    expect(transitions.some(t => t.id.startsWith('drain__'))).toBe(true)

    const launch = transitions.find(t => t.id === 'launch')
    expect(launch).toBeTruthy()
    expect(launch?.consumes.some(c => c.place === 'rocket_ready_stock')).toBe(true)
  })

  it('compiles metadata with canonical + gameSystem', () => {
    const ast = parseDslFile(CANONICAL_DSL)
    validateCanonicalAst(ast)

    const meta = compileMetadata(ast)
    expect(meta.version).toBe(1)
    expect(meta.canonical.places.length).toBeGreaterThan(10)
    expect(meta.gameSystem.resources.length).toBeGreaterThan(10)

    expect(meta.gameSystem.grid.depositConfig.lunar_hydrogen.depositCapacity).toBeGreaterThan(0)
    expect(meta.gameSystem.grid.depositConfig.lunar_hydrogen.depositCount).toBeGreaterThan(0)

    const init = meta.canonical.transitions.find(t => t.id === 'init')
    expect(init?.kind).toBe('system')
    expect(init?.activation).toBe('manual')
  })
})

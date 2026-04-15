import path from 'node:path'
import { parseDslFile } from './dsl/parse.js'
import { validateCanonicalAst } from './dsl/validate.js'
import { compilePetrinetTransitions } from './dsl/compile-petrinet.js'
import { compileGameSystemTransitions } from './dsl/compile-game-system.js'
import { compileMetadata } from './dsl/metadata.js'
import { writeJsonFile } from './dsl/write-json.js'

const REPO_ROOT = process.cwd()

const CANONICAL_DSL = path.join(REPO_ROOT, 'docs', 'lunar-chemistry-petrinet.dsl')

const OUT_PETRINET = path.join(REPO_ROOT, 'public', 'data', 'lunar-chemistry.petrinet.transitions.json')
const OUT_GAME_SYSTEM = path.join(REPO_ROOT, 'public', 'data', 'lunar-chemistry.game-system.transitions.json')
const OUT_METADATA = path.join(REPO_ROOT, 'public', 'data', 'lunar-chemistry.metadata.json')

function main() {
  const ast = parseDslFile(CANONICAL_DSL)
  validateCanonicalAst(ast)

  const petrinetTransitions = compilePetrinetTransitions(ast)
  const gameSystemTransitions = compileGameSystemTransitions(ast)
  const metadata = compileMetadata(ast)

  writeJsonFile(OUT_PETRINET, petrinetTransitions)
  writeJsonFile(OUT_GAME_SYSTEM, gameSystemTransitions)
  writeJsonFile(OUT_METADATA, metadata)

  console.log(
    `Wrote:\n- ${path.relative(REPO_ROOT, OUT_PETRINET)} (${petrinetTransitions.length} transitions)\n- ${path.relative(REPO_ROOT, OUT_GAME_SYSTEM)} (${gameSystemTransitions.length} transitions)\n- ${path.relative(REPO_ROOT, OUT_METADATA)}`,
  )
}

main()

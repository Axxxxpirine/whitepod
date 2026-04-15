import fs from 'node:fs'
import path from 'node:path'

export function writeJsonFile(filePath, data) {
  const dir = path.dirname(filePath)
  fs.mkdirSync(dir, { recursive: true })
  const text = `${JSON.stringify(data, null, 2)}\n`
  fs.writeFileSync(filePath, text)
}

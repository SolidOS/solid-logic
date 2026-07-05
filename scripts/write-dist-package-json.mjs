import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const distDir = resolve(process.cwd(), 'dist')
await mkdir(distDir, { recursive: true })
await writeFile(
  resolve(distDir, 'package.json'),
  JSON.stringify({ type: 'commonjs' }, null, 2) + '\n'
)
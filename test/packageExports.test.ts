import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

describe('package exports', () => {
    it('exports RefreshWorker.js from dist', () => {
        const packageJsonPath = resolve(__dirname, '..', 'package.json')
        const packageJson = JSON.parse(readFileSync(packageJsonPath, 'utf8'))

        expect(packageJson.exports['./RefreshWorker']).toEqual({
            import: './dist/RefreshWorker.js',
            default: './dist/RefreshWorker.js',
        })
    })
})
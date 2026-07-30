const fs = require('node:fs')
const path = require('node:path')
const { version } = require('../../package.json')

const root = path.join(__dirname, '..', '..')
for (const target of ['dist', 'dist-electron', path.join('release', version)]) {
  fs.rmSync(path.join(root, target), { recursive: true, force: true })
}

import fs from 'node:fs'
import path from 'node:path'

function copyIfExists(source, target) {
  if (!fs.existsSync(source)) {
    console.warn(`[prepare-standalone] Skip missing: ${source}`)
    return
  }

  fs.mkdirSync(path.dirname(target), { recursive: true })
  fs.rmSync(target, { recursive: true, force: true })
  fs.cpSync(source, target, { recursive: true })
  console.log(`[prepare-standalone] Copied ${source} -> ${target}`)
}

const projectRoot = process.cwd()
const nextStatic = path.join(projectRoot, '.next', 'static')
const standaloneStatic = path.join(projectRoot, '.next', 'standalone', '.next', 'static')
const publicDir = path.join(projectRoot, 'public')
const standalonePublic = path.join(projectRoot, '.next', 'standalone', 'public')

copyIfExists(nextStatic, standaloneStatic)
copyIfExists(publicDir, standalonePublic)

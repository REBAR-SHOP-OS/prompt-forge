import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import process from 'node:process'

const root = process.cwd()
const distDir = path.join(root, 'dist')
const manifestPath = path.join(distDir, '.vite', 'manifest.json')
const manifest = JSON.parse(await readFile(manifestPath, 'utf8'))

function assert(condition, message) {
  if (!condition) throw new Error(message)
}

function staticClosure(graph, roots) {
  const visited = new Set()
  const visit = (key) => {
    if (visited.has(key)) return
    const chunk = graph[key]
    assert(chunk, `Manifest references missing chunk: ${key}`)
    visited.add(key)
    for (const imported of chunk.imports ?? []) visit(imported)
  }
  for (const rootKey of roots) visit(rootKey)
  return visited
}

// Positive control: the same graph walk used for the real absence assertion
// must detect an eagerly imported FFmpeg chunk when one is present.
const positiveControl = {
  entry: { file: 'assets/entry.js', imports: ['ffmpeg'] },
  ffmpeg: { file: 'assets/ffmpeg.js' },
}
assert(
  staticClosure(positiveControl, ['entry']).has('ffmpeg'),
  'Positive-control graph did not detect an eager FFmpeg import',
)

const manifestEntries = Object.entries(manifest)
const entryPair = manifestEntries.find(
  ([source, chunk]) => chunk.isEntry && (
    source === 'index.html'
    || source === 'src/main.tsx'
    || source.endsWith('/src/main.tsx')
  ),
)
assert(entryPair, 'Could not find the production application entry in the Vite manifest')
const [entryKey] = entryPair

const studioPair = manifestEntries.find(
  ([source]) => source === 'src/modules/generator-ui/AuthenticatedStudio.tsx'
    || source.endsWith('/src/modules/generator-ui/AuthenticatedStudio.tsx'),
)
assert(studioPair, 'Could not find the deferred AuthenticatedStudio chunk in the Vite manifest')
const [studioKey] = studioPair

const startupKeys = staticClosure(manifest, [entryKey])
assert(!startupKeys.has(studioKey), 'AuthenticatedStudio is statically reachable from the Login entry')

const startupDynamicImports = new Set(
  [...startupKeys].flatMap((key) => manifest[key].dynamicImports ?? []),
)
assert(
  startupDynamicImports.has(studioKey),
  'AuthenticatedStudio is not registered as a dynamic import from the startup graph',
)

const studioKeys = staticClosure(manifest, [studioKey])
const deferredStudioKeys = new Set([...studioKeys].filter((key) => !startupKeys.has(key)))
assert(deferredStudioKeys.has(studioKey), 'Studio chunk was not deferred from startup')

function referencedFiles(keys) {
  const files = new Set()
  for (const key of keys) {
    const chunk = manifest[key]
    if (chunk.file) files.add(chunk.file)
    for (const file of chunk.css ?? []) files.add(file)
    for (const file of chunk.assets ?? []) files.add(file)
  }
  return files
}

async function listFiles(directory, prefix = '') {
  const output = []
  for (const entry of await readdir(directory, { withFileTypes: true })) {
    const relative = path.posix.join(prefix, entry.name)
    if (entry.isDirectory()) output.push(...await listFiles(path.join(directory, entry.name), relative))
    else output.push(relative)
  }
  return output
}

async function sumBytes(files) {
  let bytes = 0
  for (const file of files) bytes += (await stat(path.join(distDir, file))).size
  return bytes
}

const startupFiles = referencedFiles(startupKeys)
const deferredStudioFiles = referencedFiles(deferredStudioKeys)
const emittedFiles = await listFiles(distDir)
const ffmpegFiles = emittedFiles.filter((file) => /ffmpeg/i.test(file))
const eagerFfmpegFiles = ffmpegFiles.filter((file) => startupFiles.has(file))
assert(eagerFfmpegFiles.length === 0, `FFmpeg files are reachable from Login startup: ${eagerFfmpegFiles.join(', ')}`)

const startupJsFiles = [...startupFiles].filter((file) => file.endsWith('.js'))
const startupJsSizes = await Promise.all(
  startupJsFiles.map(async (file) => ({ file, bytes: (await stat(path.join(distDir, file))).size })),
)
const largestStartupJs = startupJsSizes.reduce(
  (largest, current) => current.bytes > largest.bytes ? current : largest,
  { file: '', bytes: 0 },
)
assert(
  largestStartupJs.bytes < 700_000,
  `Login startup still contains an oversized JavaScript chunk: ${largestStartupJs.file} (${largestStartupJs.bytes} bytes)`,
)

const metrics = {
  entry: manifest[entryKey].file,
  entryJsBytes: (await stat(path.join(distDir, manifest[entryKey].file))).size,
  studio: manifest[studioKey].file,
  studioEntryJsBytes: (await stat(path.join(distDir, manifest[studioKey].file))).size,
  startupJsBytes: await sumBytes(startupJsFiles),
  largestStartupJs,
  deferredStudioJsBytes: await sumBytes([...deferredStudioFiles].filter((file) => file.endsWith('.js'))),
  ffmpegEmittedBytes: await sumBytes(ffmpegFiles),
  startupJsFiles: startupJsFiles.sort(),
  ffmpegFiles: ffmpegFiles.sort(),
}

console.log(`LOGIN_BUNDLE_GRAPH_VERIFIED ${JSON.stringify(metrics)}`)

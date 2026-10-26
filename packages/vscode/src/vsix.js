// Empaqueta la extensión como .vsix (un ZIP con un manifiesto) sin herramientas
// de fuera: el ZIP se escribe aquí, con sus entradas «stored» (sin comprimir:
// son pocos KB) y su CRC-32.
//
//   extension.vsixmanifest   [Content_Types].xml   extension/package.json
//   extension/extension.cjs  extension/core.cjs    extension/README.md

import { readFileSync } from 'node:fs'
import { join } from 'node:path'

const encoder = new TextEncoder()

const CRC_TABLE = (() => {
  const t = new Uint32Array(256)
  for (let n = 0; n < 256; n++) {
    let c = n
    for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1
    t[n] = c >>> 0
  }
  return t
})()

/** CRC-32 (el de ZIP y PNG). */
export function crc32(bytes) {
  let c = 0xffffffff
  for (const b of bytes) c = CRC_TABLE[(c ^ b) & 0xff] ^ (c >>> 8)
  return (c ^ 0xffffffff) >>> 0
}

// Fecha fija (2026-01-01 00:00): el mismo código da el mismo .vsix, byte a byte.
const DOS_TIME = 0
const DOS_DATE = ((2026 - 1980) << 9) | (1 << 5) | 1

/** Un ZIP con `files` = [{ name, data: string | Uint8Array }] sin comprimir. */
export function zip(files) {
  const parts = []
  const central = []
  let offset = 0
  for (const f of files) {
    const name = encoder.encode(f.name)
    const data = typeof f.data === 'string' ? encoder.encode(f.data) : f.data
    const crc = crc32(data)
    const local = new DataView(new ArrayBuffer(30))
    local.setUint32(0, 0x04034b50, true) // firma de cabecera local
    local.setUint16(4, 20, true) // versión necesaria: 2.0
    local.setUint16(6, 0x0800, true) // nombres en UTF-8
    local.setUint16(8, 0, true) // método 0: stored
    local.setUint16(10, DOS_TIME, true)
    local.setUint16(12, DOS_DATE, true)
    local.setUint32(14, crc, true)
    local.setUint32(18, data.length, true)
    local.setUint32(22, data.length, true)
    local.setUint16(26, name.length, true)
    local.setUint16(28, 0, true)
    parts.push(new Uint8Array(local.buffer), name, data)

    const entry = new DataView(new ArrayBuffer(46))
    entry.setUint32(0, 0x02014b50, true) // firma del directorio central
    entry.setUint16(4, 20, true)
    entry.setUint16(6, 20, true)
    entry.setUint16(8, 0x0800, true)
    entry.setUint16(10, 0, true)
    entry.setUint16(12, DOS_TIME, true)
    entry.setUint16(14, DOS_DATE, true)
    entry.setUint32(16, crc, true)
    entry.setUint32(20, data.length, true)
    entry.setUint32(24, data.length, true)
    entry.setUint16(28, name.length, true)
    entry.setUint32(42, offset, true) // dónde empieza su cabecera local
    central.push(new Uint8Array(entry.buffer), name)
    offset += 30 + name.length + data.length
  }
  const size = central.reduce((n, p) => n + p.length, 0)
  const end = new DataView(new ArrayBuffer(22))
  end.setUint32(0, 0x06054b50, true) // fin del directorio central
  end.setUint16(8, files.length, true)
  end.setUint16(10, files.length, true)
  end.setUint32(12, size, true)
  end.setUint32(16, offset, true)
  const all = [...parts, ...central, new Uint8Array(end.buffer)]
  const out = new Uint8Array(all.reduce((n, p) => n + p.length, 0))
  let at = 0
  for (const p of all) {
    out.set(p, at)
    at += p.length
  }
  return out
}

const xml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])

/** El manifiesto que VS Code lee al instalar un .vsix. */
export function vsixManifest(ext) {
  return `<?xml version="1.0" encoding="utf-8"?>
<PackageManifest Version="2.0.0" xmlns="http://schemas.microsoft.com/developer/vsx-schema/2011" xmlns:d="http://schemas.microsoft.com/developer/vsx-schema-design/2011">
  <Metadata>
    <Identity Language="en-US" Id="${xml(ext.name)}" Version="${xml(ext.version)}" Publisher="${xml(ext.publisher)}" />
    <DisplayName>${xml(ext.displayName)}</DisplayName>
    <Description xml:space="preserve">${xml(ext.description)}</Description>
    <Categories>${xml(ext.categories.join(','))}</Categories>
    <Properties>
      <Property Id="Microsoft.VisualStudio.Code.Engine" Value="${xml(ext.engines.vscode)}" />
    </Properties>
  </Metadata>
  <Installation>
    <InstallationTarget Id="Microsoft.VisualStudio.Code" />
  </Installation>
  <Dependencies />
  <Assets>
    <Asset Type="Microsoft.VisualStudio.Code.Manifest" Path="extension/package.json" Addressable="true" />
    <Asset Type="Microsoft.VisualStudio.Services.Content.Details" Path="extension/README.md" Addressable="true" />
  </Assets>
</PackageManifest>
`
}

const CONTENT_TYPES = `<?xml version="1.0" encoding="utf-8"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension=".json" ContentType="application/json" />
  <Default Extension=".cjs" ContentType="application/javascript" />
  <Default Extension=".md" ContentType="text/markdown" />
  <Default Extension=".vsixmanifest" ContentType="text/xml" />
</Types>
`

/** El .vsix de la extensión que vive en `dir` (packages/vscode). */
export function buildVsix(dir) {
  const ext = JSON.parse(readFileSync(join(dir, 'extension.json'), 'utf8'))
  const read = (path) => readFileSync(join(dir, path))
  return {
    name: `${ext.publisher}.${ext.name}-${ext.version}.vsix`,
    bytes: zip([
      { name: 'extension.vsixmanifest', data: vsixManifest(ext) },
      { name: '[Content_Types].xml', data: CONTENT_TYPES },
      { name: 'extension/package.json', data: JSON.stringify(ext, null, 2) + '\n' },
      { name: 'extension/extension.cjs', data: read('src/extension.cjs') },
      { name: 'extension/core.cjs', data: read('src/core.cjs') },
      { name: 'extension/README.md', data: read('README.md') },
    ]),
  }
}

// API pública para quien quiera construir respuestas precocinadas
// (precompresión, ETag, cabeceras precalculadas) fuera del router.
export { encode, buildAsset, loadStatic, cacheControl, MIME, IMMUTABLE } from './static.js'

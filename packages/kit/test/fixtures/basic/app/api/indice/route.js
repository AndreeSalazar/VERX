// GET estático: se ejecuta una vez al arrancar y `verx build` lo exporta.
export const dynamic = 'force-static'

let calls = 0
export const GET = () => new Response(new Uint8Array([86, 88, 83, 49, ++calls]), { headers: { 'content-type': 'application/x-verx-test' } })

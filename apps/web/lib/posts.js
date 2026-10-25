// Datos de ejemplo. En una app real vendrían de una base de datos;
// `authorEmail` existe para demostrar que el esquema de la API no lo filtra.
export const posts = [
  {
    id: 1,
    slug: 'por-que-otro-framework',
    title: '¿Por qué otro framework?',
    date: '2026-10-25',
    summary: 'Porque casi todo lo que hace lento a un sitio se puede decidir antes de recibir la primera petición.',
    tags: ['diseño', 'rendimiento'],
    authorEmail: 'interno@ejemplo.com',
    body: [
      'La mayoría de frameworks hacen en cada petición trabajo que podría hacerse una vez: recorrer middlewares, probar expresiones regulares, leer el disco, renderizar la misma página y comprimirla mil veces.',
      'Veloz mueve ese trabajo al arranque. Una página estática ya está renderizada, comprimida con brotli 11 y con sus cabeceras calculadas antes de que llegue nadie.',
    ],
  },
  {
    id: 2,
    slug: 'de-node-a-bun',
    title: 'De Node a Bun',
    date: '2026-10-25',
    summary: 'El mismo framework sobre Bun.serve: un 65 % más de peticiones por segundo en texto y el doble en JSON.',
    tags: ['bun', 'benchmarks'],
    authorEmail: 'interno@ejemplo.com',
    body: [
      'La primera versión iba sobre node:http y ya empataba con node:http a pelo, que es el techo de cualquier framework montado encima. Para pasar de ahí había que cambiar de motor.',
      'Bun.serve trae un router nativo escrito en Zig. Medido en la misma máquina con el mismo generador de carga: 52 mil peticiones por segundo frente a 32 mil en texto, y 40 mil frente a 19 mil en JSON.',
    ],
  },
  {
    id: 3,
    slug: 'cero-js-por-defecto',
    title: 'Cero JavaScript por defecto',
    date: '2026-10-25',
    summary: 'React manda todo el árbol al navegador. Aquí sólo viajan las islas.',
    tags: ['islas', 'signals'],
    authorEmail: 'interno@ejemplo.com',
    body: [
      "En una app de React cada componente se descarga y se ejecuta en el navegador, aunque sólo pinte texto. Aquí los componentes se ejecutan en el servidor y sólo los archivos 'use client' viajan al navegador.",
      'Además no hay DOM virtual: los signals actualizan exactamente los nodos que dependen de ellos. El runtime compartido ocupa unos pocos KB comprimido.',
    ],
  },
]

export const findPost = (slug) => posts.find((p) => p.slug === slug)

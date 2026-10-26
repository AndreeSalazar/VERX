---
id: 2
title: "De Node a Bun"
date: 2026-10-25
summary: "El mismo framework sobre Bun.serve: un 65 % más de peticiones por segundo en texto y el doble en JSON."
tags: [bun, benchmarks]
authorEmail: interno@ejemplo.com
cover: /portadas/de-node-a-bun.png
coverAlt: "Un agujero negro de luz fría entre nubes azules y violetas"
---

La primera versión iba sobre `node:http` y ya empataba con `node:http` a pelo, que es el techo de cualquier framework montado encima. Para pasar de ahí había que cambiar de motor.

`Bun.serve` trae un router nativo escrito en Zig. Medido en la misma máquina con el mismo generador de carga: 52 mil peticiones por segundo frente a 32 mil en texto, y 40 mil frente a 19 mil en JSON.

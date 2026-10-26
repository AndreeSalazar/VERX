---
id: 1
title: "¿Por qué otro framework?"
date: 2026-10-25
summary: "Porque casi todo lo que hace lento a un sitio se puede decidir antes de recibir la primera petición."
tags: [diseño, rendimiento]
authorEmail: interno@ejemplo.com
cover: /portadas/por-que-otro-framework.png
coverAlt: "Un agujero negro con su disco de acreción, de canto, sobre una nebulosa violeta"
---

La mayoría de frameworks hacen en cada petición trabajo que podría hacerse una vez: recorrer middlewares, probar expresiones regulares, leer el disco, renderizar la misma página y comprimirla mil veces.

VERX mueve ese trabajo al arranque. Una página estática ya está renderizada, comprimida con brotli 11 y con sus cabeceras calculadas antes de que llegue nadie.

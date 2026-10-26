---
id: 3
title: "Cero JavaScript por defecto"
date: 2026-10-25
summary: "React manda todo el árbol al navegador. Aquí sólo viajan las islas."
tags: [islas, signals]
authorEmail: interno@ejemplo.com
---

En una app de React cada componente se descarga y se ejecuta en el navegador, aunque sólo pinte texto. Aquí los componentes se ejecutan en el servidor y sólo los archivos `'use client'` viajan al navegador.

Además no hay DOM virtual: los signals actualizan exactamente los nodos que dependen de ellos. El runtime compartido ocupa unos pocos KB comprimido.

# Istruzioni per Claude Code

## Contesto
- Il proprietario del progetto lavora soprattutto da **iPad** con sessioni cloud:
  non ha un computer per testare in locale. Prova il gioco solo dalla versione
  pubblicata su GitHub Pages.
- **Rispondi sempre in italiano**, in modo semplice: non è uno sviluppatore esperto.
- Prima di lavorare leggi `docs/DESIGN.md` (cosa deve diventare il gioco) e
  `docs/ROADMAP.md` (a che punto siamo).

## Modo di lavorare
- Una fase della roadmap alla volta. Alla fine di ogni fase spunta le checklist
  in `docs/ROADMAP.md` e fermati: spiega cosa provare sull'iPad.
- Ogni modifica deve lasciare il gioco funzionante e la build verde (`npm run build`).
- Non modificare `prototype/`: è il riferimento originale.
- Prima di dire che un lavoro è finito, esegui la build e, se possibile, prova il gioco
  in un browser headless (avvio senza errori in console, si arriva in partita).

## Stack (dalla fase 1)
- Vite + JavaScript moderno (ES modules). TypeScript non serve.
- Three.js per la grafica, Rapier (`@dimforge/rapier3d-compat`) per la fisica,
  PeerJS per il multiplayer.
- Niente asset esterni tranne le foto in `assets/faces/`: modelli, texture e suoni
  si generano nel codice. Estetica low-poly, flat shading.
- `vite.config.js` deve avere `base: '/physics-playground/'` per GitHub Pages.

## Struttura prevista di `src/`
```
src/
  main.js            avvio, loop principale
  core/              renderer, scena, input (touch + tastiera/mouse), audio, ciclo di gioco
  world/             arena, luci, oggetti fisici
  player/            controller del giocatore, vita, telecamera
  weapons/           definizioni delle armi, raycast, effetti
  enemies/           modello low-poly, volti foto, IA, spawn
  game/              round, punteggio, stati (lobby, gioco, pausa, game over)
  net/               multiplayer PeerJS (host/client, messaggi)
  ui/                HUD, menu, schermate
```
Le foto in `assets/faces/` si caricano con `import.meta.glob`, così ogni foto
aggiunta alla cartella entra nel gioco senza toccare il codice.

## Prestazioni (iPad/telefono)
- Pixel ratio massimo 1.75 su touch, ombre a 1024 px, pochi materiali condivisi.
- Riusa geometrie e materiali; evita di creare oggetti a ogni frame.
- Obiettivo: almeno 30 fps con 20 nemici a schermo.

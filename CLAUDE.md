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
- Niente asset esterni: modelli, texture e suoni si generano nel codice.
  Estetica low-poly, flat shading.
- `vite.config.js` deve avere `base: '/physics-playground/'` per GitHub Pages.

## Privacy dei volti (regola fissa)
- Repository e sito sono **pubblici**. Non aggiungere mai foto o immagini di persone
  al repository, nemmeno come esempio o per i test (per i test usa immagini generate
  via codice, ad esempio con un canvas).
- I volti li carica il giocatore dal suo dispositivo (`<input type="file" accept="image/*" multiple>`),
  vengono ridimensionati a 256×256 in un canvas e salvati solo in IndexedDB.
- Nessun upload verso server o servizi esterni. In multiplayer i volti passano solo
  dall'host ai client tramite PeerJS e i client li tengono in memoria.
- I dettagli sono in `docs/DESIGN.md`, nella sezione "Volti dei nemici".

## Struttura prevista di `src/`
```
src/
  main.js            avvio, loop principale
  core/              renderer, scena, input (touch + tastiera/mouse), audio, ciclo di gioco
  world/             arena, luci, oggetti fisici
  player/            controller del giocatore, vita, telecamera
  weapons/           definizioni delle armi, raycast, effetti
  enemies/           modello low-poly, IA, spawn
  faces/             galleria volti: caricamento, ritaglio, IndexedDB, facce procedurali
  game/              round, punteggio, stati (lobby, gioco, pausa, game over)
  net/               multiplayer PeerJS (host/client, messaggi, invio volti)
  ui/                HUD, menu, schermate
```

## Prestazioni (iPad/telefono)
- Pixel ratio massimo 1.75 su touch, ombre a 1024 px, pochi materiali condivisi.
- Riusa geometrie e materiali; evita di creare oggetti a ogni frame.
- Obiettivo: almeno 30 fps con 20 nemici a schermo.

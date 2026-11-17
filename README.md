# Physics Playground

Un FPS web in stile low-poly, giocabile da browser su iPad, telefono e computer.
Si gioca a round contro ondate di nemici che hanno per volto delle foto vere,
con armi diverse e un multiplayer cooperativo per 2-4 giocatori.

> Stato: **fase 0 – prototipo**. Per ora il gioco è il prototipo in un unico file
> (`prototype/physics-playground.html`): un parco giochi fisico con casse, domino,
> palla demolitrice e palline da lanciare.

## Come giocare

Quando GitHub Pages è attivo, il gioco è online qui:
**https://4nso.github.io/physics-playground/**

- **Touch**: joystick a sinistra, trascina a destra per guardare, pulsanti per le azioni
- **Desktop**: WASD per muoverti, mouse per guardare, clic per sparare, E per afferrare, Spazio per saltare

## Struttura del repository

```
prototype/        Prototipo originale in un unico file HTML (riferimento, non si modifica)
assets/faces/     Foto dei volti dei nemici (vedi assets/faces/README.md)
docs/             Design del gioco e piano di lavoro
  DESIGN.md       Cosa deve diventare il gioco
  ROADMAP.md      Le fasi di sviluppo, con le checklist
.github/workflows Pubblicazione automatica su GitHub Pages
CLAUDE.md         Istruzioni per le sessioni di Claude Code
```

Dalla fase 1 il codice del gioco vivrà in `src/` (progetto Vite). La struttura
prevista è descritta in `CLAUDE.md`.

## Tecnologie

- [Three.js](https://threejs.org/): grafica 3D
- [Rapier](https://rapier.rs/): fisica (sostituisce Cannon.js del prototipo)
- [Vite](https://vite.dev/): sviluppo e build
- [PeerJS](https://peerjs.com/): multiplayer peer-to-peer

Tutte gratuite e open source (licenze MIT / Apache-2.0).

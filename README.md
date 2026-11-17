# Shoot Your Friends

Un FPS web in stile low-poly, giocabile da browser su iPad, telefono e computer.
Si gioca a round contro ondate di nemici che hanno per volto delle foto vere,
con armi diverse e un multiplayer cooperativo per 2-4 giocatori.

**Privacy:** il repository e il sito non contengono foto. Ogni giocatore carica i volti
dal proprio dispositivo, dentro il gioco. Le foto restano nel suo browser e in
multiplayer passano solo, direttamente, ai giocatori della stanza.

> Stato: **fase 4 – multiplayer cooperativo**. Si gioca a ondate contro nemici low-poly
> con i volti scelti dal giocatore, da soli o in squadra da 2 a 4 (stanza con codice).

## Come giocare

Quando GitHub Pages è attivo, il gioco è online qui:
**https://4nso.github.io/physics-playground/**

- **Touch**: joystick a sinistra, trascina a destra per guardare; tieni premuto **Spara** e
  trascina il dito per mirare; tocca il pannello dell'arma per cambiarla, **⟳** per ricaricare,
  **⏸** per la pausa
- **Desktop**: WASD per muoverti, mouse per mirare, clic per sparare, 1/2/3 o rotella per
  cambiare arma, R per ricaricare, E per afferrare, Spazio per saltare, Esc per la pausa
- **In squadra**: uno tocca "Crea stanza" e legge il codice agli amici; gli altri toccano
  "Entra con codice". Quando tutti sono dentro, l'host tocca "Inizia partita". Se un compagno
  è a terra, stagli vicino qualche secondo per rianimarlo
- **Volti**: nel menu apri "Galleria volti" e aggiungi foto dal dispositivo. Restano solo nel
  tuo browser (IndexedDB) e si possono eliminare quando vuoi

**Icona sulla schermata Home**: su iPad/iPhone apri il gioco in Safari, tocca Condividi →
"Aggiungi alla schermata Home". Il gioco si apre a schermo intero, come un'app.

## Struttura del repository

```
src/              Codice del gioco (core, world, player, weapons, enemies, faces, game, net, ui)
index.html        Pagina del gioco
public/           Icone (generate dal codice da icon.svg) e manifest
scripts/          Script di servizio (make-icons.cjs rigenera le icone PNG)
prototype/        Prototipo originale in un unico file HTML (riferimento, non si modifica)
docs/             Design del gioco e piano di lavoro
  DESIGN.md       Cosa deve diventare il gioco
  ROADMAP.md      Le fasi di sviluppo, con le checklist
.github/workflows Pubblicazione automatica su GitHub Pages
CLAUDE.md         Istruzioni per le sessioni di Claude Code
```

Per lavorare in locale: `npm install`, poi `npm run dev` (sviluppo) o `npm run build`
(crea `dist/`, che il workflow pubblica su GitHub Pages).

## Tecnologie

- [Three.js](https://threejs.org/): grafica 3D
- [Rapier](https://rapier.rs/): fisica (sostituisce Cannon.js del prototipo)
- [Vite](https://vite.dev/): sviluppo e build
- [PeerJS](https://peerjs.com/): multiplayer peer-to-peer

Tutte gratuite e open source (licenze MIT / Apache-2.0).

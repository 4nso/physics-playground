# Roadmap

Si lavora una fase alla volta. Alla fine di ogni fase il gioco deve essere online
su GitHub Pages e provato su iPad prima di passare alla successiva.

## Fase 0 – Prototipo ✅
- [x] Parco giochi fisico in un unico file (`prototype/physics-playground.html`)

## Fase 1 – Progetto vero
- [ ] Progetto Vite in `src/` con moduli separati (vedi CLAUDE.md)
- [ ] Three.js e Rapier installati da npm al posto della CDN e di Cannon.js
- [ ] Porting del prototipo: arena, giocatore, controlli touch e desktop, casse
- [ ] Aggiornare `.github/workflows/deploy.yml` perché faccia la build con Vite
- [ ] Il gioco è online e funziona su iPad

## Fase 2 – Armi
- [ ] Sistema armi: pistola, fucile a pompa, mitra
- [ ] Raycast, scie, scintille, impulso fisico sugli oggetti colpiti
- [ ] Munizioni, ricarica, rinculo; HUD con arma e munizioni
- [ ] Cambio arma da touch (pulsante) e da desktop (1/2/3 e rotella)
- [ ] Modelli low-poly delle armi e suoni procedurali

## Fase 3 – Nemici e round
- [ ] Nemico low-poly con animazione di camminata
- [ ] Galleria volti nel menu: caricamento dal dispositivo, ritaglio quadrato,
      salvataggio in IndexedDB, eliminazione
- [ ] Volti applicati come texture sulla testa; facce procedurali se la galleria è vuota
- [ ] Inseguimento e attacco, vita del giocatore e dei nemici
- [ ] Gestione dei round: ondate, pausa tra i round, difficoltà crescente
- [ ] Punteggio, schermata di game over, record salvato in localStorage
- [ ] Varianti di nemico: veloce e grosso

## Fase 4 – Multiplayer cooperativo
- [ ] Lobby: gioca da solo, crea stanza, entra con codice
- [ ] Connessione PeerJS, host autoritativo
- [ ] Sincronizzazione di giocatori, nemici, colpi e round
- [ ] L'host invia i volti della sua galleria ai client (solo in memoria, mai salvati)
- [ ] Rianimare i compagni a terra
- [ ] Test con 2 dispositivi reali

## Fase 5 – Rifinitura (idee)
- [ ] Più arene, oggetti esplosivi, potenziamenti
- [ ] Gioco installabile (PWA) e funzionamento offline
- [ ] Impostazioni: sensibilità, volume, qualità grafica

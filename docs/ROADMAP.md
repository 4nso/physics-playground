# Roadmap

Si lavora una fase alla volta. Alla fine di ogni fase il gioco deve essere online
su GitHub Pages e provato su iPad prima di passare alla successiva.

## Fase 0 – Prototipo ✅
- [x] Parco giochi fisico in un unico file (`prototype/physics-playground.html`)

## Fase 1 – Progetto vero ✅
- [x] Progetto Vite in `src/` con moduli separati (vedi CLAUDE.md)
- [x] Three.js e Rapier installati da npm al posto della CDN e di Cannon.js
- [x] Porting del prototipo: arena, giocatore, controlli touch e desktop, casse
- [x] Aggiornare `.github/workflows/deploy.yml` perché faccia la build con Vite
- [x] Il gioco è online e funziona su iPad

## Fase 2 – Armi ✅
- [x] Sistema armi: pistola, fucile a pompa, mitra
- [x] Raycast, scie, scintille, impulso fisico sugli oggetti colpiti
- [x] Munizioni, ricarica, rinculo; HUD con arma e munizioni
- [x] Cambio arma da touch (pulsante) e da desktop (1/2/3 e rotella)
- [x] Modelli low-poly delle armi e suoni procedurali
- [x] Provato su iPad
- [x] Corretto il tremolio dell'arma (movimenti filtrati, fisica interpolata)

## Fase 3 – Nemici e round (in prova su iPad)
- [x] Nemico low-poly con animazione di camminata
- [x] Galleria volti nel menu: caricamento dal dispositivo, ritaglio quadrato,
      salvataggio in IndexedDB, eliminazione
- [x] Volti applicati come texture sulla testa; facce procedurali se la galleria è vuota
- [x] Inseguimento e attacco, vita del giocatore e dei nemici
- [x] Gestione dei round: ondate, pausa tra i round, difficoltà crescente
- [x] Punteggio, schermata di game over, record salvato in localStorage
- [x] Varianti di nemico: veloce e grosso
- [ ] Provato su iPad (anche con 20 nemici a schermo)

Note: il mitra si sblocca dal round 3; tra i round compaiono munizioni e vita;
le casse lanciate e la palla demolitrice fanno danno ai nemici.

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

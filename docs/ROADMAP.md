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
- [ ] Provato su iPad in modo approfondito (anche con 20 nemici a schermo)

Note: il mitra si sblocca dal round 3; tra i round compaiono munizioni e vita;
le casse lanciate e la palla demolitrice fanno danno ai nemici.

## Fase 4 – Multiplayer cooperativo (da provare con 2 dispositivi)
- [x] Lobby: gioca da solo, crea stanza, entra con codice
- [x] Connessione PeerJS, host autoritativo
- [x] Sincronizzazione di giocatori, nemici, colpi e round
- [x] L'host invia i volti della sua galleria ai client (solo in memoria, mai salvati)
- [x] Rianimare i compagni a terra
- [ ] Test con 2 dispositivi reali

Note: il server pubblico di PeerJS serve solo a mettere in contatto i dispositivi; poi i dati
(posizioni, colpi, volti) viaggiano direttamente tra loro. Funziona meglio sulla stessa rete Wi‑Fi.
In multiplayer solo l'host può afferrare gli oggetti; la pausa non ferma la partita per gli altri.

## Fase 4b – Controlli su telefono (da provare su un telefono vero)
- [x] Pannello armi compatto: pillola piccola con le 3 armi e le munizioni, un tocco cambia arma
- [x] Tutta la metà destra dello schermo serve a guardare; l'HUD non blocca i tocchi
- [x] Pulsanti ad arco nell'angolo in basso a destra ("Spara" il più grande), safe area rispettate
- [x] Impostazioni: dimensione dei pulsanti e sensibilità della visuale
- [x] Sensibilità touch proporzionale allo schermo e visuale fluida; joystick sinistro rivisto
- [x] Bloccati i gesti di Safari (zoom, doppio tocco, selezione, menu a pressione lunga, swipe indietro)
- [x] Gioco installabile su Home (manifest PWA); in verticale compare "Ruota il telefono"
- [x] HUD in alto a sinistra più piccolo sugli schermi piccoli
- [x] Verificato con screenshot headless: iPhone 844×390 e 932×430, Android 915×412, iPad 1180×820
- [ ] Provato su un telefono vero

Note: la corsa su touch si attiva spingendo il joystick oltre il bordo. Su schermi molto larghi
il campo visivo orizzontale è limitato a circa 100° per non deformare l'immagine.
Impostazioni salvate in localStorage (menu principale e pausa → ⚙️ Impostazioni).

## Fase 5 – Mondo grande (in prova su iPad/iPhone)
Passo 1 (generatore e pathfinding):
- [x] Sezione "Mondo" in `docs/DESIGN.md`
- [x] Generatore con seed, tutto raggiungibile; in multiplayer l'host manda il seed
- [x] Griglia di navigazione e percorsi dei nemici (anche su più piani)
- [x] Comparsa dei nemici lontano e fuori vista; casse e palloni sparsi
- [x] Geometria unita, luce nei colori dei vertici, nebbia; minimappa
- [x] Verifica con screenshot headless a 844×390

Passo 1b (dopo la prima prova sull'iPhone):
- [x] Corretti i glitch grafici: sfarfallio tra la cima dei muri e i tetti, gradini a filo del
      pavimento; non si può più salire sui tetti
- [x] Mappa riordinata in 3 zone tematiche: parcheggio multipiano (3 livelli con rampe),
      parco giochi al centro (palle, casse e giochi), backrooms (un unico labirinto)
- [x] La minimappa mostra il nome della zona e il piano del parcheggio
- [ ] Provato su iPad/iPhone

Note: ogni partita genera una mappa nuova (90×72 m); il numero della mappa si vede nel menu di pausa
e si può riusare aprendo il gioco con `?seed=NUMERO`. Misure headless a 844×390: 15–30 chiamate di
disegno nel parcheggio e nelle backrooms, circa 110 nel parco (ogni cassa e palla è disegnata a parte).
Nei test 17 nemici su 18 salgono fino al tetto del parcheggio e attraversano il labirinto delle backrooms.

Passo 2 (varietà, dopo la prova): altre zone (piscine, uffici, scale verso stanze strane),
instancing di casse e palle per alleggerire il parco.

## Fase 6 – Rifinitura (idee)
- [ ] Oggetti esplosivi, potenziamenti
- [ ] Funzionamento offline (il gioco è già installabile dalla fase 4b)
- [ ] Impostazioni: volume, qualità grafica (sensibilità e pulsanti fatti nella fase 4b)

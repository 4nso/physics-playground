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

## Fase 7 – Progressione, negozio e zona segreta
Dettagli in `docs/DESIGN.md`, sezione "Progressione, negozio e zona segreta".
Si lavora a passi: dopo ogni passo si pubblica e ci si ferma per provare.

Passo 1 – Difficoltà a livelli:
- [x] Massimo 25 round, schermata di vittoria
- [x] Curva di difficoltà procedurale (numero, vita, danno, velocità dei nemici)
- [x] Limiti di velocità: base appena sotto il giocatore, rossi pari al giocatore
- [x] Nemici più forti nei round alti (corazzato, boss ogni 5 round)

Passo 2 – Armi e negozio:
- [x] Si parte con pistola e mitra
- [x] Nuove armi: fucile d'assalto, fucile da cecchino con zoom, lanciagranate, bazooka
      (più il fucile a pompa da comprare)
- [x] Esplosioni con danno ad area e spinta fisica
- [x] Area negozio nella mappa: armi, munizioni, potenziamenti base
- [x] Inventario 2-3 armi e cambio rapido anche da touch
- [x] Tabella di prezzi e bilanciamento scritta in DESIGN.md

Passo 3 – Passaggio segreto e zona sicura:
- [x] Muro appena più giallo nelle backrooms (posizione dal seed) che porta alla zona sicura
- [x] Zona sicura in cui i nemici non entrano
- [x] Cassa misteriosa a prezzo fisso con animazione
- [x] Potenziatore: 2 livelli per arma, strisce viola, poi viola e arancione
- [x] Negozio, passaggio e zona sicura come elementi riutilizzabili in altre mappe
- [x] Multiplayer: punti e acquisti per giocatore, decisi dall'host

## Fase 8 – Il fattore "amico"
Dettagli in `docs/DESIGN.md`, sezione "Il fattore amico". Un passo alla volta, poi prova.

Passo 1 – Volti riconoscibili (in prova su iPad):
- [x] Teste giganti (bobblehead) con la faccia su tutto il davanti
- [x] Faccia sempre leggibile: 512×512, niente nebbia/ombre, contrasto e luminosità
- [x] Faccia che reagisce (colpo, attacco, quasi morto)
- [x] Nome per ogni volto nella galleria, sopra la testa da vicino e nei messaggi
- [ ] Provato su iPad

Note: la testa è un ovale grande il doppio, che dondola sul collo; nei nemici grossi cresce meno
del corpo per non sbattere sui soffitti del parcheggio. Il nome si scrive nella schermata di ritaglio
o sotto la foto in galleria (max 14 lettere) e si vede sopra la testa entro 11 m. I messaggi
"Hai eliminato Marco ×3" e "Ti ha ucciso Luca" compaiono in alto; il secondo anche nel game over.
In multiplayer i nomi viaggiano con i volti, dall'host ai client. Verificato in headless
(1180×820 e 844×390, anche host + client con server PeerJS locale): nessun errore in console.

Passo 2 – Ritaglio intelligente (in prova su iPad/iPhone):
- [x] Riconoscimento del viso nel browser, centratura e zoom automatici
- [x] Scontorno dello sfondo; ritaglio manuale come riserva
- [ ] Provato su foto prese dal rullino dell'iPhone (anche verticali e grandi)

Note: MediaPipe (BlazeFace + segmentazione "selfie"), tutto sul dispositivo. I due modelli
(480 KB in tutto) sono in `public/models/`; il motore WASM (14 MB, 4 MB compresso) non sta nel
repository: `vite.config.js` lo copia da `node_modules` nella build e il browser lo scarica solo
quando si aggiunge una foto. Se il viso non si trova, o il motore non parte, resta il ritaglio a mano.
Verificato in headless con volti disegnati via codice (foto 3024×4032 e 4032×3024, anche viso piccolo):
viso trovato in circa 1 s la prima volta (caricamento), poi in meno di 0,2 s.

Passo 3 – Amici protagonisti (in prova su iPad):
- [x] Statistiche di fine partita con manifesto "RICERCATO"
- [x] Boss con testone e nome dell'amico
- [x] Manifesti con le facce appesi nella mappa
- [x] Multiplayer: selfie o volto dalla galleria per il proprio personaggio
- [x] Multiplayer: consenso nella lobby (condividere il volto, usarlo per gli zombi)
- [ ] Provato su iPad (e in multiplayer con 2 dispositivi)

Note: a fine partita compaiono fino a 2 manifesti: l'amico che hai eliminato più volte e quello che
ti ha ucciso più volte (conta solo questo dispositivo). Il boss ha la testa 1,35 volte più grande
(≈4,4 m di altezza) e si rimpicciolisce sotto i soffitti bassi; il suo nome si legge da 45 m e
compare nell'annuncio. 5 manifesti per zona, posizioni dal seed (uguali per tutti in multiplayer).
Nella stanza: 📸 Selfie o 🖼️ Galleria; "Mostra il mio volto" (acceso di base quando scegli un volto)
e "Può diventare la faccia degli zombi" (spento di base). Senza consenso il volto non parte dal
dispositivo. Il proprio volto si ricorda solo in questo browser. Verificato in headless anche con
host + client (server PeerJS locale): nomi nella lista, omino con la faccia, volto tra gli zombi.
Corretto anche il deploy su GitHub Pages: build e pubblicazione in due job separati.

## Fase 9 – Luna park centrale
Dettagli in `docs/DESIGN.md`, sezione "Mondo" → "Luna park centrale".

Passo 1 – La zona (in prova su iPad):
- [x] Zona centrale più grande e strutturata: ingresso, viale, piazza, negozio in un edificio
- [x] Elementi giocosi di oggi mantenuti; luci, insegne, lampioni
- [x] Navigazione dei nemici, spawn e minimappa aggiornati
- [ ] Provato su iPad

Note: la zona centrale passa da 30 a 48 m di larghezza (la mappa intera è 108×72 m) e si chiama
"Luna park" nella minimappa. Le aree della ruota e delle montagne russe sono per ora cantieri
con il cartellone "Prossimamente!". I giochi di prima stanno in 10 piazzole ai lati.

Passo 2 – Ruota panoramica (in prova su iPad):
- [x] Ruota con cabine, sali/scendi, si spara da seduti
- [x] Cabina di comando (avvia, ferma, velocità), avvio ritardato da soli
- [x] Multiplayer: uno aziona, gli altri sono a bordo (stato deciso dall'host)
- [ ] Provato su iPad (e in multiplayer con 2 dispositivi)

Note: la ruota è nell'area a nord-ovest della piazza (8 cabine, cima a ~20 m). Tasti: F sali/scendi,
G avvia/ferma, V velocità; su touch compaiono i pulsanti in basso. Da soli: "Avvia" aspetta 6 secondi
se nessuno è seduto. Dall'alto la nebbia si allontana e si vede tutta la mappa. Scendendo in alto si
salta giù senza danni. Verificato in headless: da soli e con host + client (server PeerJS locale).

Passo 3 – Montagne russe (in prova su iPad):
- [x] Percorso a spline dal seed che passa sopra la mappa e torna al luna park
- [x] Carrelli con più posti, stessa logica di comando e multiplayer della ruota
- [x] Prestazioni: binari e sostegni nella geometria unita della mappa (nessuna chiamata di disegno
      in più, meglio dell'instancing); si muovono solo i 3 vagoni
- [ ] 30+ fps su iPhone (da misurare sul telefono vero)
- [ ] (Facoltativo) terza giostra: catene, autoscontri o tagadà — non fatta
- [ ] Provato su iPad (e in multiplayer con 2 dispositivi)

Note: stazione a nord-est della piazza (banchina con la pensilina viola), comandi nella casetta
viola accanto. Una corsa = 2 giri (~280 m l'uno): salita sopra le backrooms, passaggio sopra il
luna park e il parcheggio, ritorno lungo il muro nord. Si sale e si scende solo in stazione.
Il codice delle giostre ora ha un "motore" per tipo (ruota, montagne russe) in `src/game/rides.js`.
Verificato in headless: da soli (partenza, salita, frenata, arrivo e discesa sulla banchina) e con
host + client (server PeerJS locale).

## Fase 10 – Grafica
Dettagli in `docs/DESIGN.md`, sezione "Grafica". Si lavora a passi: dopo ogni passo si pubblica e
ci si ferma per provare. Ogni passo deve restare sopra i 30 fps su iPhone in qualità Media: per ogni
passo si riportano gli fps prima e dopo (headless 844×390 e, dal passo 1, il contatore nel gioco).

Passo 1 – Misura e qualità:
- [x] Misurati gli fps attuali (headless 844×390) e contatore fps nel gioco per misurare sul telefono vero
- [x] Impostazione qualità Bassa/Media/Alta con scelta automatica in base al dispositivo
- [x] Adattamento agli fps: se il gioco rallenta, la qualità scende da sola
- [x] Corretto il glitch sul bordo davanti del vagone delle montagne russe
- [ ] Provato su iPhone/iPad (fps letti dal contatore in qualità Media)

Note: la qualità cambia per ora la risoluzione (Bassa 1×, Media 1,35×, Alta 1,75× sui touch; 1,5× e 2×
sul computer) e la distanza di vista (46 / 58 / 70 m); i passi 2 e 3 aggiungono qui gli effetti.
Automatica: Media su telefoni e tablet, Alta sul computer, Bassa sui dispositivi deboli. Se per 4 s
il gioco sta sotto i 27 fps scende di un livello (e lo ricorda per la volta dopo); se per 12 s sta
sopra i 55 risale, ma mai oltre la scelta iniziale né a un livello già risultato lento.
Impostazioni → "Mostra gli fps" mostra in alto fps e qualità in uso.
Il vagone: il bordo bianco e il pannello davanti avevano la faccia di sopra alla stessa altezza
(sfarfallio a strisce) e il muso sporgeva sopra il bordo; ora nessuna faccia si sovrappone.

Misure headless (iPhone simulato 844×390, densità 3×, scheda grafica software: valgono i confronti,
non i numeri assoluti; sul telefono vero sono molto più alti):

| Scena | Prima (1,75×) | Bassa | Media | Alta |
|---|---|---|---|---|
| Partenza (luna park) | 28 fps | 57 | 43 | 27 |
| Piazza del luna park | 38 fps | 60 | 55 | 36 |
| 20 nemici a schermo | 11 fps | 28 | 16 | 15 |

Con 20 nemici le chiamate di disegno passano da ~70 a ~230 (ogni nemico è fatto di più pezzi):
è il punto più pesante, da alleggerire nei passi successivi se il telefono vero non regge.

Passo 2 – Luce ed effetti di schermo:
- [ ] Cielo a gradiente con sole, luce migliore
- [ ] Ambient occlusion dipinta nei vertici, ombre vicine solo in Alta
- [ ] Bloom su neon, insegne ed esplosioni; correzione colore, vignettatura, antialiasing

Passo 3 – Atmosfera e dettagli vivi:
- [ ] Dal giorno alla notte con l'avanzare dei round (luna park illuminato di notte)
- [ ] Particelle (polvere nelle backrooms, fumo e detriti nelle esplosioni), acqua animata
- [ ] Fori dei proiettili e bruciature sui muri, che spariscono dopo un po'
- [ ] Animazioni migliori di nemici e arma, feedback dei colpi più chiaro

## Idea futura – Mappa dell'università (da riprendere, non iniziare senza il proprietario)
Ricostruire in low-poly l'edificio universitario del proprietario, su più piani: piano
d'ingresso in salita dalla strada, piano terra a livello strada, poi secondo, terzo e quarto piano.
Metodo deciso:
1. Il proprietario fotografa le planimetrie di evacuazione di ogni piano, 3-5 ambienti per piano
   (senza persone riconoscibili) e una vista laterale dell'edificio per il dislivello.
2. Le foto **non entrano nel repository** (è pubblico): da queste si ricava, un piano alla volta,
   una mappa a griglia in testo in `docs/levels/universita.md` (stanze, porte, scale, colori).
3. Un costruttore di livelli legge quel file: per correggere la mappa si modifica il testo.
4. Fedele ma adattata al gioco (stile low-poly, corridoi un po' più larghi). Si parte dal piano d'ingresso.
Il negozio, il passaggio segreto e la zona sicura vanno fatti come elementi riutilizzabili,
così si potranno spostare anche in questa mappa.

## Fase 6 – Rifinitura (idee)
- [ ] Oggetti esplosivi, potenziamenti
- [ ] Funzionamento offline (il gioco è già installabile dalla fase 4b)
- [ ] Impostazioni: volume, qualità grafica (sensibilità e pulsanti fatti nella fase 4b)

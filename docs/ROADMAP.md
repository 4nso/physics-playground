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
- [x] Pulsante d'azione contestuale al posto di "Afferra" (come B sul controller): compare solo vicino
      a qualcosa con un'animazione e diventa Compra/Chiudi, Cassa, Potenzia, Sali/Scendi, Avvia/Ferma,
      Afferra/Lancia; arco ridisposto (Salta a sinistra, Ricarica in diagonale, azione sopra Spara)
- [x] Verificato con screenshot headless a 844×390 e 932×430: negozio, cabina e posto della giostra,
      cassa misteriosa, cassa da afferrare/lanciare, cecchino, lontano da tutto; nessun errore in console
- [ ] Pulsante d'azione provato su iPad/telefono (dal proprietario)

Note: la corsa su touch si attiva spingendo il joystick oltre il bordo. Su schermi molto larghi
il campo visivo orizzontale è limitato a circa 100° per non deformare l'immagine.
Impostazioni salvate in localStorage (menu principale e pausa → ⚙️ Impostazioni).
Pulsante d'azione: regola in `docs/DESIGN.md` → "Controlli touch". Al negozio il pannello resta chiuso
finché non si tocca "Compra"; nel pannello delle giostre su touch restano solo le informazioni e il
pulsante della velocità.

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

Passo 2 – Luce ed effetti di schermo (in prova su iPhone/iPad):
- [x] Cielo a gradiente con sole, luce migliore
- [x] Ambient occlusion dipinta nei vertici, ombre vicine solo in Alta
- [x] Bloom su neon, insegne ed esplosioni; correzione colore, vignettatura, antialiasing
- [ ] Misurati gli fps sul telefono vero in qualità Media (30+)

Note: cosa c'è in ogni qualità.
- Bassa: come prima (cielo a tinta unita, niente effetti), risoluzione 1×.
- Media: cielo a gradiente con il sole, ombre morbide sul pavimento alla base di muri e oggetti,
  bloom (le luci "brillano": lampadine, neon, insegne, fuoco, scie, lampo dello sparo, sole),
  colori un po' più vivi e caldi, angoli appena più scuri, antialiasing FXAA. Risoluzione 1,25× sui touch.
- Alta: come Media, più ombre in tempo reale degli oggetti che si muovono (nemici, casse, palloni,
  giostre) entro ~20 m dal giocatore, bloom più largo, antialiasing MSAA 4×. Risoluzione 1,75×.
La mappa continua ad avere la luce dipinta nei vertici: le ombre in tempo reale si aggiungono solo
sulle facce al sole e solo per le cose che si muovono (i tetti non scuriscono le stanze).

Misure headless (iPhone simulato 844×390, densità 3×):

| Scena | Bassa | Media passo 1 | Media passo 2 |
|---|---|---|---|
| Partenza (luna park) | 47 fps | 43 | 14–16 |
| Piazza del luna park | 60 fps | 55 | 17–18 |
| 20 nemici a schermo | 18–22 fps | 16 | 11 |

Attenzione: nel browser headless non c'è una scheda grafica, è tutto calcolato dal processore, e proprio
gli effetti nuovi (immagine HDR a 16 bit, passaggi a tutto schermo) lì costano moltissimo, mentre
sui chip di iPhone e iPad sono quasi gratis. Il numero che conta è quello del contatore sul telefono.
Se in Media il telefono scende sotto i 27 fps, in automatico la qualità passa da sola a Bassa.

Alleggerimento dopo la prova su iPhone 14 Pro Max ("in Alta gira un po' male"):
- [x] Risoluzione dinamica a ogni livello (anche scelto a mano): sotto i 52 fps scende del 10% alla
      volta fino al 70%, sopra i 58 risale; se abbassarla non serve (es. risparmio energetico) torna com'era.
      Il contatore mostra "ris. 80%" quando è abbassata.
- [x] Nemici, compagni, casse, palloni e oggetti raccolti con un materiale più semplice (Lambert invece di
      PBR): stesso aspetto low-poly, molto meno lavoro per pixel
- [x] Alta sui telefoni: risoluzione massima 1,5× (era 1,75×); ombre aggiornate a 30 fps
- [ ] Riprovato su iPhone in Alta e in Media

| Scena (headless) | Media prima | Media dopo | Alta prima | Alta dopo | Bassa dopo |
|---|---|---|---|---|---|
| Partenza | 14–16 fps | 25 | 4 | 7 | 54 |
| Piazza del luna park | 17–18 fps | 25 | 4 | 10 | 60 |
| 20 nemici a schermo | 11 fps | 16 | 4 | 8 | 29 |

Passo 3 – Atmosfera e dettagli vivi (in prova su iPhone):
- [x] Dal giorno alla notte con l'avanzare dei round (luna park illuminato di notte)
- [x] Particelle (polvere nelle backrooms, fumo e detriti nelle esplosioni), acqua animata
- [x] Fori dei proiettili e bruciature sui muri, che spariscono dopo un po'
- [x] Animazioni migliori di nemici e arma, feedback dei colpi più chiaro
- [ ] Provato su iPhone

Note: round 1 mattina, verso il round 11 pomeriggio dorato, verso il 18 tramonto, al 25 notte con
stelle e luna; il passaggio avviene piano tra un round e l'altro. Di notte le luci del luna park restano
accese (e con il bloom brillano di più); parcheggio e backrooms, al chiuso, si scuriscono meno.
Per vedere subito un'ora: aggiungere `?ora=0.75` (tramonto) o `?ora=1` (notte) all'indirizzo.
Acqua: nuova fontana nel luna park (sempre presente, in una delle piazzole dei giochi).
Fori e bruciature: una sola mesh "a istanze" (120 al massimo, una chiamata di disegno), spariscono
dopo 14 s (fori) e 25 s (bruciature); anche i colpi degli altri giocatori lasciano il foro.
Polvere delle backrooms: solo in Media e Alta. Mirino: X bianca per un colpo, gialla alla testa,
rossa quando il nemico muore, con un "tic" diverso per ognuno. Nemici: passo strascicato, busto
inclinato che gira e ondeggia, slancio in avanti quando colpiscono. Arma: respiro da fermi,
abbassamento quando si atterra, inclinata e bassa quando si corre.

Misure headless (iPhone simulato, stesse scene; Media e Alta con la risoluzione dinamica attiva):

| Scena | Bassa | Media | Alta |
|---|---|---|---|
| Partenza | 58 fps | 18 | 7 |
| Piazza del luna park | 60 fps | 21 | 10 |
| 20 nemici a schermo | 29 fps | 13 | 8 |

Rispetto al passo precedente gli fps non cambiano (le differenze sono nel margine di errore della misura).

## Fase 11 – Controller (in prova su iPad)
Dettagli in `docs/DESIGN.md`, sezione "Piattaforme" → "Controller".
- [x] Gamepad API: controller Xbox/PlayStation riconosciuto su iPad, telefono e computer
- [x] Mappatura dei tasti come nella tabella del design
- [x] Levetta destra con zona morta, curva di risposta, sensibilità nelle impostazioni,
      leggero aiuto alla mira
- [x] Tutti i menu navigabili col controller (A conferma, B indietro)
- [x] HUD che passa da touch a controller e viceversa, suggerimenti con i tasti del controller
- [x] Vibrazione se supportata
- [x] Mouse su iPad: prova il pointer lock anche lì, altrimenti resta il trascinamento
- [ ] Provato su iPad con controller Xbox (dal proprietario)

Note: il codice è in `src/core/gamepad.js` (più `src/core/rumble.js` per la vibrazione). Safari mostra il
controller solo dopo la prima pressione di un tasto: nei menu quella pressione serve solo ad attivarlo
(compare il riquadro giallo sulla selezione). Toccando lo schermo, usando mouse o tastiera tornano i
controlli di prima; premendo un tasto del controller spariscono di nuovo i pulsanti touch.
In partita: levetta sinistra muove (premuta = corsa finché la si tiene spinta), RT spara, LT tenuto
premuto = mirino (solo armi con zoom), A salta, X ricarica, Y/RB arma successiva, LB precedente,
croce ◀ ▲ ▶ armi 1-2-3, croce ▼ velocità della giostra, B interagisce (giostra, poi negozio, altrimenti
afferra/lascia una cassa), ≡ pausa, ⧉ statistiche. Al negozio: B apre la scelta, croce ◀ ▶ sceglie,
A compra, B chiude; cassa misteriosa e potenziatore si comprano subito con B.
Levetta destra: zona morta 13%, curva (lenta a metà corsa, veloce a fondo), a fondo per più di ¼ s gira
fino al 50% più svelta. Aiuto alla mira (Impostazioni → Controller, acceso di base): vicino a un nemico
visibile entro 45 m la visuale rallenta e viene tirata piano verso il petto; mai attraverso i muri.
Nei menu: croce o levetta sinistra spostano la selezione, ◀ ▶ regolano le barre, A conferma, B indietro,
≡ preme il pulsante principale (Gioca, Riprendi, Rigioca). Nelle caselle di testo A apre la tastiera.
Vibrazione: quando si spara e quando si viene colpiti (Chrome sì; Safari forse no: se non è supportata
non succede nulla). Il suono parte solo dopo un primo tocco dello schermo se il browser non accetta
il controller come "gesto" (succede su iPhone/iPad).
Mouse su iPad: al clic il gioco chiede il pointer lock; oggi Safari su iPad lo rifiuta e resta il
trascinamento, ma se Apple lo aggiunge funzionerà da solo.
Verificato in headless con un controller simulato (iPad 1180×820, telefono 844×390, computer 1280×800):
menu, partita, negozio, giostra, mirino del cecchino, pausa e impostazioni; nessun errore in console.

## Fase 12 – Prestazioni, arsenale folle e luna park più comodo
Dettagli in `docs/DESIGN.md`, sezione "Arsenale folle e luna park più comodo".
Un passo alla volta, pubblicando e fermandosi per la prova.

Passo 1 – Diagnosi e sistemazione delle prestazioni (in prova sul Mac):
- [x] Misurare il tempo per fotogramma diviso tra CPU (fisica, nemici, percorsi, giostre, HUD)
      e GPU (effetti di schermo, ombre, risoluzione, chiamate di disegno) in qualità Alta
- [x] Scrivere in DESIGN.md cosa pesava e cosa si è cambiato, con fps prima e dopo
- [x] Correggere le cause principali (es. effetti a risoluzione ridotta, meno chiamate di
      disegno, niente oggetti creati a ogni fotogramma, percorsi dei nemici calcolati meno spesso)
- [ ] Obiettivo: 60 fps stabili in Alta su un Mac recente, 30+ su iPhone in Media
      (da verificare sul Mac e sull'iPhone veri con il contatore)

Note: la diagnosi e le misure sono in DESIGN.md ("Diagnosi e correzioni (passo 1)"). In breve: il
processore lavorava poco; pesava la scheda grafica, perché in Alta sul Mac si disegnavano 5,6 milioni
di pixel (Retina 2×) con MSAA, ombre e bloom. Ora Alta sul computer usa 1,5× (max 3,4 milioni di pixel),
le ombre si calcolano solo vicino al giocatore, i percorsi dei nemici non creano più scatti.
Lavoro di disegno in Alta −55% (−44% con 20 nemici). Con `?prof` nell'indirizzo si vedono i
millisecondi di ogni parte (strumento: `src/core/prof.js`).

Passo 2 – Luna park più comodo ed economia (in prova):
- [x] Montagne russe: sosta di ~8 s in stazione dopo il primo giro, si può scendere (e salire)
- [x] Munizioni di riserva raddoppiate
- [x] Bancarella MUNIZIONI al posto di POPCORN: chiusa fino al round 10, poi 4500 punti per
      riempire tutte le armi
- [x] Cura completa nel negozio: 2000 punti, una volta per round

Note: dettagli in DESIGN.md ("Valori attuali (passo 2)"). La bancarella ha una saracinesca con scritto
"Apre al round 10" che si alza da sola. Verificato in headless da soli: bancarella chiusa e aperta,
acquisto (punti tolti, armi piene), cura (seconda nello stesso round rifiutata), sosta delle montagne
russe con il giocatore seduto (riparte) e scendendo durante la sosta. Multiplayer: stessa logica
dell'host già usata per negozio e cassa, non provato con due dispositivi.

Passo 3 – Nuove armi (in prova):
- [x] Coltello e spada (corpo a corpo, animazioni, suoni)
- [x] Mitra a tripletta e uzi doppia (due armi in mano)
- [x] Raygun: proiettili verdi esplosivi, solo dalla cassa
- [x] Cassa misteriosa con rarità (raygun ~2%), effetto speciale per la raygun
- [x] Nuove armi nel negozio, potenziabili, in multiplayer, con touch e controller

Note: valori in DESIGN.md ("Valori attuali (passo 3)"). Si usano come le altre armi: "Spara" su touch,
RT sul controller, clic col mouse. Verificato in headless: danni di ogni arma (coltello 60, spada 250,
tripletta 3×40 a pressione, uzi, raygun ad area), probabilità della cassa su 100 000 estrazioni,
negozio su telefono (le 10 armi più cura e potenziamenti stanno nel pannello), multiplayer con server
PeerJS locale (spada, raygun e tripletta di un client fanno danno ai nemici dell'host).

## Fase 13 – Mira di precisione su PC (in prova sul Mac)
Dettagli in `docs/DESIGN.md`, sezione "Mira di precisione (fase 13, solo PC)".
- [x] Tasto destro = mira (tieni premuto), sinistro = spara; opzione "premi per attivare"
- [x] Tacche di mira nel modello in prima persona di ogni arma con mira, allineate al centro
- [x] Transizione morbida, zoom leggero, mirino a croce nascosto
- [x] Dispersione e rinculo ridotti, movimento più lento, niente corsa; sensibilità in base allo zoom
- [x] Uzi doppia con mira "leggera"; cecchino col suo mirino e lo stesso comportamento
- [x] Niente mira per lanciagranate, bazooka, coltello e spada
- [x] Afferrare su PC solo con E; touch e controller invariati
- [x] Verificato con screenshot headless (desktop 1440×900) che le tacche siano al centro per ogni arma
- [ ] Provato sul Mac con mouse e tastiera (dal proprietario)

Note: verificato in headless (desktop 1440×900): per pistola, fucile a pompa, mitra, fucile d'assalto,
mitra a tripletta e raygun la punta rossa del mirino cade esattamente al centro dello schermo
(720, 450), il mirino a croce sparisce e lo zoom è quello previsto; uzi doppia con le armi più vicine e
il mirino a croce visibile; cecchino col suo mirino; bazooka, lanciagranate, coltello e spada senza mira.
Nessun errore in console. Il clic sinistro mentre si tiene il destro non è verificabile in headless
(serve il puntatore catturato): è gestito con mousedown/mouseup apposta per questo caso.

## Fase 14 – Modalità sviluppatore
Dettagli in `docs/DESIGN.md`, sezione "Modalità sviluppatore (fase 14)". Due passi, poi prova.

Passo 1 – Pannello e comandi principali (in prova su iPad):
- [x] Attivazione solo per l'host (impostazioni e `?dev`), pulsante 🛠, pannello a schede
      usabile con mouse, touch e controller
- [x] Etichetta "🛠 DEV" per tutti; record e statistiche non salvati nelle partite di test
- [x] Scheda Partita: ferma/elimina zombi, round N, crea nemici, velocità del tempo, ora, seed
- [x] Scheda Giocatore: soldi, vita, invincibile, munizioni infinite, volo libero, velocità, teletrasporto
- [x] Scheda Armi: qualsiasi arma, livello di potenziamento, cassa truccata, bancarella aperta, cura
- [x] Codice in `src/dev/` caricato solo quando serve
- [ ] Provato su iPad

Note: si attiva da Impostazioni → "🛠 Sviluppatore" (con conferma) o con `?dev` nell'indirizzo; non
resta salvata: ricaricando la pagina si spegne. Il pulsante 🛠 (trascinabile) apre il pannello; su
PC anche il tasto `\` e, col controller, "🛠 Pannello sviluppatore" nel menu di pausa (croce per
muoversi, A preme, B riduce a icona). Con il pannello aperto la partita continua. Il pannello (12 KB)
si scarica solo all'attivazione. `?dev&round=10` fa partire la partita dal round 10. Sui client la
modalità si spegne da sola e l'interruttore è disattivato. Per ora i comandi della scheda Giocatore
valgono per l'host stesso; velocità del tempo, ora del giorno e bancarella aperta contano sull'host
(i client vedono l'ora decisa dai round). Verificato in headless (1180×820, 844×390 touch e host +
client con server PeerJS locale): nessun errore in console, il client vede "🛠 DEV" e non salva il record.

Passo 2 – Strumenti avanzati (in prova su iPad):
- [x] Scheda Mondo e giostre (muro segreto, spawn, percorsi, collisioni, comandi delle giostre)
- [x] Scheda Grafica e prestazioni (fps, qualità, interruttori degli effetti, wireframe)
- [x] Scheda Volti (volti di prova generati, svuota galleria)
- [x] Scheda Diagnosi ("Copia stato", registro eventi)
- [x] Multiplayer: comandi dell'host applicabili a un giocatore scelto, provati con server PeerJS locale
- [ ] Provato su iPad (passo 1 e passo 2)

Note: il pannello ora ha 7 schede su due righe. Mondo: muro segreto (riquadro e raggio verdi), ultimi 30
punti di comparsa (colonnine rosse), percorsi dei nemici (linee gialle), contorni delle collisioni entro
22 m; si vedono attraverso i muri. Giostre: avvia, ferma, velocità 1-2-3 e "salta alla sosta" delle
montagne russe, da qualsiasi punto. Grafica: fps, disegni e triangoli, tempi per parte (come `?prof`),
qualità al volo (non salvata), interruttori di effetti di schermo, bloom, ombre, nebbia e fil di ferro.
Volti: 3 o 8 facce disegnate dal codice ("Prova 1"…), svuota galleria con conferma. Diagnosi: "Copia
stato" (versione con commit e data della build, mappa, round, posizione, armi, soldi, fps, impostazioni,
ultimi errori ed eventi) e registro degli ultimi eventi; errori ed eventi si registrano sempre, solo in
memoria. Multiplayer: in Giocatore e Armi compare "Applica a" con i giocatori della stanza; soldi, vita
(anche rianimare), invincibilità, armi, livello, munizioni e teletrasporto (anche "Da me") valgono per il
giocatore scelto: l'host decide e manda il comando al suo dispositivo. Verificato in headless (anche host
+ client con server PeerJS locale): nessun errore in console.

## Fase 15 – Il cimitero dietro l'EXIT e la mappa grande
Dettagli in `docs/DESIGN.md`, sezioni "Il cimitero dietro l'EXIT (fase 15)" e "Mappa grande".
Un passo alla volta, pubblicando e fermandosi per la prova.

Passo 1 – Cancello, chiave e notte anticipata (in prova su iPad):
- [x] Cancello EXIT con insegna rossa al neon sul muro del luna park (lato bancarelle)
- [x] Il boss del round 10 lascia cadere la chiave; si raccoglie e si porta al cancello ("Apri")
- [x] Multiplayer: chiave e cancello decisi dall'host; comandi nella modalità sviluppatore
- [x] Nuova curva giorno/notte: crepuscolo avanzato al round 10, notte piena al 25, si vede sempre bene
- [x] Mappa grande: tocca/clicca la minimappa (o ⧉ sul controller) per aprirla e chiuderla
- [ ] Provato su iPad

Note: il cancello è in fondo al viale, dopo l'arco d'ingresso, nel muro sud (x = 10): pilastri di pietra,
due ante a sbarre (un solo InstancedMesh), lucchetto con catena, insegna EXIT al neon che ogni tanto
sfarfalla e ronza (suono generato, si sente entro ~16 m). Dietro c'è per ora una nicchia buia sbarrata da
assi: il tunnel arriva nel passo 2. La chiave (dorata, con una colonna di luce) cade dove muore il primo boss
del round 10; si raccoglie passandoci sopra, nell'HUD compare 🗝️; se chi la porta va a terra o esce dalla
partita la chiave cade lì. Al cancello: pulsante d'azione "🗝️ Apri" (touch), F (tastiera), B (controller);
senza chiave "🔒 Serve una chiave". Le ante si aprono verso la nicchia in ~2,4 s con un cigolio; il cancello
resta aperto fino alla fine della partita. Sulla minimappa il varco è una sbarra rossa (verde se aperto).
Modalità sviluppatore, scheda Mondo: "Dai la chiave" (anche a un giocatore scelto), "Fai cadere la chiave
qui", "Apri il cancello EXIT" e il teletrasporto "🚪 Cancello EXIT" (anche in Giocatore). Giorno/notte:
round 1 giorno, ~4 pomeriggio, ~7 tramonto, 10 crepuscolo avanzato (cielo blu scuro, stelle, luci accese),
poi scurisce fino alla notte del 25. Mappa grande: tocco/clic sulla minimappa, M sulla tastiera, ⧉ sul
controller (ha preso il posto delle statistiche, che ora sono scritte sotto la mappa). Verificato in headless
(1180×820, 844×390 touch e host + client con server PeerJS locale: il client raccoglie la chiave, tocca
"Apri" e il cancello si apre per tutti): nessun errore in console.

Passo 2 – Tunnel, sala delle candele e cripta:
- [ ] Tunnel buio in discesa (~40-50 m) con lampade che sfarfallano
- [ ] Sala circolare con candele in cerchio, porta sigillata (futura) e porta con scalinata
- [ ] Uscita da una cripta con cancelletto dentro il cimitero
- [ ] Navigazione dei nemici attraverso tunnel, sala e cripta

Passo 3 – Il cimitero:
- [ ] Cimitero grande: lapidi, bare, vialetti, siepi, alberi spogli, cappelle, nebbia
- [ ] Piazzetta con fontana funeraria
- [ ] Zombi che escono dalle tombe
- [ ] Nemici in versione zombi (anche le facce) per chi è nel cimitero, solo grafica e locale
- [ ] Bare che si rompono sparando (vita in base al danno); 2 bare scelte col seed con la raygun
- [ ] Prestazioni: 30+ fps su iPhone anche nel cimitero (instancing di lapidi e bare)

Idea in forse (non fare ora): torcia sulle armi negli ultimi 5 round con notte più scura.

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

# Game design

## L'idea in una riga

Uno sparatutto in prima persona a round, low-poly, nel browser: sopravvivi a
ondate di nemici dalla faccia fotografica, da solo o con 1-3 amici.

## Pilastri

1. **Semplice da avviare**: apri un link e giochi, anche su iPad. Niente installazioni.
2. **Low-poly e procedurale**: geometrie semplici, colori piatti, texture e suoni
   generati via codice. Nel progetto non c'è nessuna immagine: le foto dei volti
   le carica il giocatore.
3. **Fisica che si sente**: oggetti che volano, nemici che vengono sbalzati,
   casse da usare come coperture.
4. **Divertente in compagnia**: cooperativa per 2-4 giocatori via link e codice stanza.

## Ciclo di gioco

1. Lobby: gioco da solo, oppure creo una stanza o entro in una stanza con un codice
2. Round N: arrivano nemici a ondate da punti lontani della mappa
3. Il round finisce quando tutti i nemici sono eliminati
4. Pausa breve (10-15 s): ricarico, raccolgo munizioni, e si mostrano punteggio e prossimo round
5. Ogni round ha più nemici, più veloci e più resistenti, e ogni tanto compare un nemico speciale
6. Game over quando tutti i giocatori sono a terra; si mostrano round raggiunto e punteggi

## Armi

Si parte con **pistola e mitra**. Tutte le altre si comprano al negozio o escono dalla
cassa misteriosa (vedi "Progressione, negozio e zona segreta").

| Arma | Ruolo | Come si ottiene |
|---|---|---|
| Pistola | Base, colpi infiniti, precisa | All'inizio |
| Mitra | Fuoco continuo | All'inizio |
| Fucile a pompa | Distanza ravvicinata, più pallini, spinge i nemici | Negozio / cassa |
| Fucile d'assalto | Raffica precisa a media distanza | Negozio / cassa |
| Fucile da cecchino | Colpo potentissimo, mirino con zoom | Negozio / cassa |
| Lanciagranate | Granate a parabola, danno ad area | Negozio / cassa |
| Bazooka | Razzo, grande esplosione ad area e spinta fisica | Negozio / cassa |

Se ha senso, Code può proporre qualche arma in più.

- Colpi istantanei (raycast) con scie e scintille visibili
- Munizioni, ricarica, rinculo della visuale, mirino che si allarga
- Modelli delle armi low-poly costruiti nel codice, suoni generati con WebAudio
- I colpi applicano anche un impulso fisico agli oggetti dinamici

## Nemici

- Corpo low-poly (torso, braccia, gambe a blocchi) con una semplice animazione di camminata
- **Volto**: foto presa a caso dalla galleria volti (vedi sotto), applicata come
  texture sulla parte frontale della testa
- Senza foto caricate, i nemici hanno facce low-poly generate dal codice
  (occhi, bocca, espressioni casuali)
- Inseguono il giocatore più vicino, attaccano in mischia
- Barra della vita sopra la testa; alla morte diventano un ragdoll o si sbriciolano
- Varianti: base, veloce, grosso (lento e resistente)

## Progressione, negozio e zona segreta

### Round e difficoltà
- **Massimo 25 round.** Superato il 25 la partita è vinta: schermata di vittoria
  (la ricompensa si decide più avanti)
- Difficoltà **procedurale e graduale**: a ogni round più nemici, con più vita, più danno
  e più velocità
- **Limiti di velocità**, raggiunti verso il round 25:
  - zombi base: appena più lenti del giocatore che cammina
  - zombi rossi (veloci): alla stessa velocità del giocatore che cammina
  - nessun nemico è mai più veloce di così
- **Nemici più forti** nei round alti: ad esempio un corazzato lento e resistentissimo,
  e un boss ogni 5 round

#### Valori attuali (passo 1, formule in `src/game/difficulty.js`)
Il giocatore cammina a 5,5 m/s e corre a 9 m/s.

| Round | Nemici | Vita base | Danno | Vel. base | Vel. rossi | Boss |
|---|---|---|---|---|---|---|
| 1 | 7 | 45 | ×1,0 | 2,7 | 3,8 | – |
| 5 | 20 | 69 | ×1,15 | 3,2 | 4,2 | 1 |
| 10 | 38 | 108 | ×1,34 | 3,7 | 4,5 | 1 |
| 15 | 58 | 156 | ×1,53 | 4,2 | 4,9 | 1 |
| 20 | 80 | 213 | ×1,72 | 4,6 | 5,2 | 2 |
| 25 | 104 | 278 | ×1,91 | 5,0 | 5,5 | 2 |

(Da solo; con più giocatori i nemici sono di più e un po' più resistenti. Al massimo 20 vivi insieme.)

| Tipo | Da quando | Vita | Danno | Velocità (round 1 → 25) | Punti |
|---|---|---|---|---|---|
| Base (blu) | sempre | ×1 | 10 | 2,7 → 5,0 | 100 |
| Veloce (rosso) | round 2 | ×0,6 | 7 | 3,8 → 5,5 | 150 |
| Grosso (verde) | round 3 | ×3,2 | 22 | 2,0 → 3,8 | 300 |
| Corazzato (grigio, elmo e piastra) | round 8 | ×4,5 | 18 | 1,8 → 3,3 | 450 |
| Boss (viola, corna d'oro) | ogni 5 round | ×14 | 25 | 2,3 → 4,4 | 2500 |

### Punti e negozio
- I punti dei nemici uccisi sono la **moneta**
- **Area negozio** nella mappa, riconoscibile (banco, insegna luminosa). Avvicinandosi si
  vedono armi e prezzi, e si compra con un tocco
- Si comprano armi, munizioni e potenziamenti base (vita massima, velocità di ricarica)
- Il negozio è una zona tranquilla ma **non sicura**: i nemici possono entrare
- **Inventario**: 2-3 armi in mano, cambio rapido anche da touch
- La tabella di prezzi e bilanciamento si scrive qui quando si implementa

#### Prezzi e armi (passo 2, valori in `src/weapons/defs.js`)
Si parte con **pistola e mitra**; si tengono al massimo **3 armi**. Comprando un'arma nuova con
3 armi in mano, sostituisce quella che hai in mano. Ricomprare un'arma che hai già = munizioni piene.
Il negozio è il chiosco con l'insegna gialla "NEGOZIO" davanti alla piazza di partenza.

| Arma | Prezzo | Munizioni | Danno | Note |
|---|---|---|---|---|
| Pistola | (iniziale) | – | 26 | colpi infiniti |
| Mitra | 1000 (iniziale) | 400 | 15 | fuoco continuo veloce |
| Fucile a pompa | 1500 | 500 | 9 × 15 | da vicino, spinge i nemici |
| Fucile d'assalto | 3000 | 800 | 34 | raffica precisa |
| Fucile da cecchino | 4000 | 900 | 260 (testa ×2,5) | mirino con zoom ×3,2; senza mirino è impreciso |
| Lanciagranate | 6000 | 1200 | 230 ad area (raggio 3,6 m) | granate a parabola che rimbalzano |
| Bazooka | 9000 | 1500 | 520 ad area (raggio 5 m) | razzo dritto, grande spinta |

Le esplosioni fanno danno pieno al centro e il 40% al bordo, spingono nemici, oggetti e il
giocatore (le proprie esplosioni non fanno male, ma spingono: si può fare il "salto col razzo").

| Potenziamento | Livello 1 | Livello 2 |
|---|---|---|
| Vita massima +25 (100 → 125 → 150) | 2500 | 4000 |
| Ricarica veloce (−20%, poi −35%) | 2000 | 3500 |

Punti: ogni nemico dà i suoi punti a chi l'ha colpito per ultimo; il bonus di fine round
(250 × round) va a tutti. Il record usa il totale della squadra (i punti spesi non si perdono).

### Passaggio segreto e zona sicura
- Nei corridoi gialli delle backrooms c'è un punto di muro **appena più giallo** degli altri,
  con una differenza minima, da notare solo guardando bene. La posizione cambia con il seed
- Attraversandolo si entra in un'altra stanza: una **zona sicura** dove i nemici non entrano.
  Si esce dallo stesso passaggio
- Nella zona sicura:
  1. **Cassa misteriosa**: a prezzo fisso fa un giro casuale e dà un'arma a caso tra quelle
     del negozio, con l'animazione delle armi che girano prima di fermarsi
  2. **Potenziatore**: pagando potenzia l'arma in mano (più danno, caricatore e cadenza).
     Massimo **2 potenziamenti per arma**, e ogni livello cambia colore all'arma in alcuni punti:
     - livello 1: strisce **viola**
     - livello 2 (massimo): strisce **viola e arancione**

#### Valori attuali (passo 3)
- Il passaggio è nel muro est delle backrooms (il confine della mappa), in una riga scelta dal seed.
  Il pannello finto ha il colore del muro con +7 rosso, +4 verde, −6 blu: si nota solo guardando bene.
- Una barriera invisibile ferma i nemici; i giocatori passano. Anche i colpi si fermano lì, come
  su un muro vero: dalla zona sicura non si spara fuori (altrimenti si vincerebbe senza rischi).
- Chi è nella zona sicura non viene inseguito né colpito; i round però non vanno avanti da soli.
- **Cassa misteriosa: 950 punti.** Arma a caso tra quelle del negozio che non hai già (mai la pistola);
  le armi girano per circa 3 secondi, poi l'arma arriva in mano (sostituisce quella in mano se ne hai 3).
- **Potenziatore** (arma in mano): livello 1 = 5000, livello 2 = 9000.
  Danno ×1,7 / ×2,6 · caricatore e scorta ×1,5 / ×2 · tempo tra i colpi ×0,85 / ×0,72.
  Il livello resta legato a quel tipo di arma per tutta la partita. Il nome dell'arma mostra ★ o ★★.
- Codice: `src/world/safezone.js` (passaggio e stanza, riutilizzabili), `src/game/safezone.js` (cassa e
  potenziatore), `src/world/shop.js` (chiosco del negozio, riutilizzabile).

### Regole
- Negozio, passaggio segreto e zona sicura sono **elementi riutilizzabili**, da posizionare
  in qualsiasi mappa (serviranno anche per la futura mappa dell'università)
- Multiplayer: punti, acquisti, cassa e potenziamenti sono di ogni singolo giocatore, ma li decide l'host
- Su telefono i pulsanti per comprare e interagire stanno comodi sotto il pollice

## Volti dei nemici (privacy prima di tutto)

Il repository e il sito sono pubblici, quindi **le foto non stanno mai nel progetto**.

- Nel menu c'è una **galleria volti**: "Aggiungi volti" apre il selettore di foto del
  dispositivo (rullino dell'iPad/telefono), con selezione multipla
- Ogni foto viene ridimensionata nel browser a 512×512, con un ritaglio quadrato
  centrato e regolabile (trascina e zoom per centrare il viso)
- Le foto restano **solo nel browser** del giocatore (IndexedDB) e si possono
  eliminare una a una o tutte insieme
- Sotto ogni volto ci sono i simboli dei tipi di nemico (🔵 base, 🔴 veloce, 🟢 grosso,
  🛡️ corazzato, 👑 boss): si può dare un volto solo a certi tipi. Nessun simbolo = tutti i nemici.
  Un tipo senza volti suoi usa quelli "per tutti"; se non ce ne sono, facce disegnate dal gioco
- Nessuna foto viene mai inviata a un server
- In multiplayer l'host invia i volti della sua galleria **direttamente** ai giocatori
  della stanza, tramite la connessione PeerJS. I client li tengono solo in memoria per
  quella partita, senza salvarli

## Il fattore "amico" (fase 8)

Il gioco si chiama Shoot Your Friends: il volto dell'amico deve essere **riconoscibile al primo
sguardo**, anche da lontano e su un telefono, e gli amici devono essere protagonisti.

### Volti riconoscibili
- **Teste giganti** in stile "bobblehead": testa circa il doppio del normale, la faccia occupa
  tutto il davanti (anche come forma arrotondata, non solo un cubo)
- **Ritaglio intelligente**: il gioco trova da solo il viso nella foto, lo centra, lo ingrandisce
  e scontorna lo sfondo (resta solo la faccia). Gira tutto nel browser, sul dispositivo
  (ad esempio MediaPipe Face Detection / segmentazione); il modello di riconoscimento va
  incluso nel progetto (è un file del programma, non una foto). Se il riconoscimento non trova
  il viso, resta il ritaglio manuale di oggi
- **Faccia sempre leggibile**: risoluzione 512×512, niente nebbia né ombre sul volto,
  luminosità e contrasto leggermente aumentati, filtro texture nitido
- **Faccia che reagisce**: si schiaccia quando viene colpita, si allunga quando attacca,
  diventa rossa quando sta per morire

#### Valori attuali (passo 1, in `src/enemies/model.js` e `src/faces/gallery.js`)
- Testa: ovale 0,88 × 0,96 × 0,80 m (prima 0,46 × 0,50 × 0,44), sul collo a 1,54 m; altezza totale 2,5 m.
  Nei nemici grossi la testa cresce meno del corpo (scala^0,25): grosso ≈ 3,3 m, boss ≈ 3,6 m
- Faccia: foto 512×512 in un ovale che copre tutta la metà davanti, bordo sfumato nel colore dei lati;
  materiale senza luce, nebbia e ombre; luminosità +12 e contrasto ×1,15; filtro anisotropico al massimo
- Reazioni: colpita si schiaccia (−32% in altezza) con un rimbalzo; attaccando si allunga (+28%);
  sotto il 30% di vita pulsa di rosso; camminando la testa dondola sul collo
- Nome: massimo 14 lettere, cartellino giallo sopra la testa visibile entro 11 m

#### Valori attuali (passo 2, in `src/faces/detect.js`)
- Riconoscimento: BlazeFace "short range" su tutta la foto rimpicciolita a 1024 px; se non trova niente
  riprova su 4 zone sovrapposte (60% della foto), utile per visi piccoli. Si prende il viso più grande
- Inquadratura: quadrato di 1,6 × il riquadro del viso, centro un po' più in alto (per i capelli);
  zoom fino a ×12 per le foto grandi del telefono. L'utente può sempre correggere con le dita
- Scontorno: segmentazione "selfie" sul ritaglio 512×512; lo sfondo diventa un colore pieno preso dalla
  pelle (più scuro del 18%), che è anche il colore della testa in gioco. Pulsante per lasciare lo sfondo
- I modelli sono di Google MediaPipe, con licenza Apache 2.0

### Gli amici protagonisti
- **Nome per ogni volto**: quando si carica una foto si scrive un nome (es. "Marco").
  Il nome compare sopra la testa (solo da vicino, per non affollare lo schermo) e nei messaggi:
  "Hai eliminato Marco ×3", "Ti ha ucciso Luca"
- **Statistiche a fine partita**: l'amico eliminato più volte, quello che ti ha ucciso di più,
  presentati come un **manifesto "RICERCATO"** con la faccia
- **Boss con la faccia di un amico**: il boss ogni 5 round ha un testone enorme e il suo nome
  in grande
- **Manifesti sui muri**: poster "RICERCATO" con le facce della galleria appesi qua e là
  (backrooms, parcheggio, luna park), generati dal gioco
- **In multiplayer ognuno con la propria faccia**: nella lobby ogni giocatore può farsi un selfie
  (`<input type="file" accept="image/*" capture="user">`) o sceglierne una dalla galleria, e il
  suo personaggio la mostra. Gli zombi possono usare anche le facce di chi è nella stanza

### Consenso e privacy
- Valgono tutte le regole di "Volti dei nemici": niente foto nel repository o su server,
  galleria solo in IndexedDB, in multiplayer le foto viaggiano solo tra i giocatori della stanza
- Nella lobby ogni giocatore sceglie se **condividere** il proprio volto con la stanza
  e se permettere che diventi la faccia degli zombi. Senza consenso il suo volto resta
  solo sul suo dispositivo
- I nomi viaggiano insieme ai volti e seguono le stesse regole

## Multiplayer (cooperativo)

- Peer-to-peer con PeerJS: chi crea la stanza fa da **host** ed è lui a decidere
  nemici, round e danni
- Gli altri inviano i propri input e la propria posizione, e ricevono lo stato dall'host
- Da 2 a 4 giocatori, codice stanza di 4-5 caratteri
- Se l'host esce, la partita finisce (va bene così per la prima versione)

## Mondo

Un mondo grande in stile **backrooms giocoso e un po' surreale**, diviso in **zone tematiche**
una accanto all'altra (così ci si orienta): da ovest a est

1. **Parcheggio multipiano** (30×72 m): 3 livelli (terra, piano 1, tetto) collegati da rampe,
   pilastri con una fascia colorata per piano (giallo, blu, rosso), auto parcheggiate, neon sotto
   le solette. Dal piano 1 e dal tetto si guarda giù sul parco
2. **Parco giochi** (30×72 m, al centro): prato con vialetti e tante piazzole di giochi: torrette con
   scivolo, altalene, sabbiera, piscina di palline, fortino di casse, arrampicata, trampolini,
   giostra e dondolo, palle giganti, piramide di casse, alberi e panchine. La partenza è nella
   piazza al centro, con la palla demolitrice
3. **Backrooms** (30×72 m): un unico labirinto di corridoi gialli con moquette e neon (qualcuno spento),
   qualche salone più grande, sedie e casse abbandonate

- **Seed**: un numero decide i dettagli (labirinto, auto, quali giochi e dove, porte).
  Stesso seed = stessa mappa. In multiplayer l'host manda solo il numero
- **Passaggi**: 3 varchi tra parcheggio e parco, 3 porte tra parco e backrooms
- **Più livelli**: rampe del parcheggio, torrette, arrampicata, trampolini
- **Nemici che navigano**: griglia di navigazione (celle da 1 m, anche su più piani) calcolata dalla
  geometria; i nemici seguono il percorso più breve (salgono le rampe, attraversano il labirinto)
- **Comparsa dei nemici**: lontano e fuori dalla vista dei giocatori
- **Orientarsi**: minimappa in alto a sinistra che ruota con la visuale, con il nome della zona
  (e il piano nel parcheggio)
- **Prestazioni**: geometria statica unita in blocchi da 12×12 m, luce "dipinta" nei colori dei
  vertici, niente ombre in tempo reale, nebbia oltre ~55 m. Obiettivo 30+ fps su iPhone
- **Niente sfarfallii**: due superfici non stanno mai sullo stesso piano; i muri esterni sono alti
  11 m, così non si sale sui tetti

### Luna park centrale (fase 9)
La zona centrale (parco giochi, dove ci sono la partenza e il negozio) diventa più grande e
più strutturata: un **luna park**. Restano gli elementi giocosi di oggi, ma si aggiungono:
- **Struttura**: un ingresso con arco e insegne, un viale principale, una piazza centrale con
  il negozio in un vero edificio/chiosco, aree attorno alle giostre, lampioni e luci colorate.
  La zona si allarga (anche ridisegnando le misure delle altre zone, se serve)
- **Giostre funzionanti**, su cui si sale davvero:
  - **Ruota panoramica**: cabine che girano; dall'alto si vede tutta la mappa e si può sparare
  - **Montagne russe**: un percorso che passa **sopra la mappa** (sopra parcheggio e
    backrooms, con salite, discese e curve) e torna al luna park
  - Se c'è spazio, una terza giostra a scelta (giostra a catene, autoscontri o tagadà)
- **Come funzionano**:
  - Ogni giostra ha una **cabina di comando** con leva/pulsante: avvia, ferma, velocità
  - Ci si **siede** avvicinandosi a un posto libero (pulsante "Sali"), e si scende con "Scendi"
    o quando la corsa finisce; da seduti si guarda in giro e si spara
  - **In multiplayer** un giocatore aziona la giostra e gli altri ci stanno sopra
  - **Da soli** la cabina di comando ha un avvio ritardato (pochi secondi per correre a sedersi)
    oppure la giostra fa giri automatici
  - I nemici non salgono sulle giostre, ma aspettano all'uscita
- **Tecnica**: le giostre sono oggetti che si muovono da programma (cinematici); chi è seduto
  segue il posto. In multiplayer l'host decide lo stato della giostra (posizione, velocità,
  chi è seduto) e lo invia agli altri. Il percorso delle montagne russe è una curva liscia
  (spline) generata con il seed; binari e sostegni ripetuti con instancing

## Grafica (fase 10)

Restiamo **low-poly**, ma più curato e d'atmosfera, senza perdere i 30 fps su iPhone.
- **Qualità grafica** Bassa / Media / Alta nelle impostazioni, con scelta automatica in base
  al dispositivo e agli fps (se il gioco rallenta, scende da solo)
- **Luce migliore**: cielo a gradiente con sole, ombreggiature morbide negli angoli (ambient
  occlusion dipinta nei vertici), ombre in tempo reale solo vicino al giocatore e solo in qualità Alta
- **Effetti di schermo**: bagliore (bloom) su neon, insegne, esplosioni e luci del luna park;
  correzione colore e leggera vignettatura; antialiasing
- **Atmosfera che cambia con i round**: si parte di giorno e si arriva al round 25 di notte,
  con il luna park tutto illuminato
- **Dettagli vivi**: acqua animata in piscina, polvere nell'aria delle backrooms, fumo e
  detriti nelle esplosioni, fori dei proiettili e bruciature sui muri (che spariscono dopo un po')
- **Animazioni**: camminata dei nemici più naturale, oscillazione dell'arma in mano,
  feedback dei colpi più chiaro
- Palette di colori coerente per zona; tutto continua a essere generato via codice

## Piattaforme

- iPad e telefono: controlli touch (joystick e pulsanti), 30 fps stabili come minimo
- Desktop: tastiera e mouse con pointer lock

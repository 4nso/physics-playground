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
| Coltello | Corpo a corpo veloce, pochi danni, colpi infiniti | Negozio (economico) / cassa |
| Spada | Fendente largo che colpisce più nemici davanti, danni altissimi, un po' lenta | Negozio (caro) / cassa |
| Mitra a tripletta | Ogni pressione spara 3 colpi in rapida sequenza, precisa | Negozio / cassa |
| Uzi doppia | Una mitraglietta per mano, cadenza altissima, poco precisa, ricarica lenta | Negozio / cassa |
| Raygun | Colpi laser verdi visibili (non raggio istantaneo) che esplodono con danno ad area | **Solo cassa, rarissima (~2%)** |

Dettagli di bilanciamento della fase 12 nella sezione "Arsenale folle e luna park più comodo".

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

### Arsenale folle e luna park più comodo (fase 12)

**Nuove armi** (valori indicativi, il bilanciamento fine lo fa Code provando):

| Arma | Prezzo | Caricatore / riserva | Note |
|---|---|---|---|
| Coltello | 300 | infinito | colpo corpo a corpo rapido (~1,6 m), danno ~60, alla testa ×2 |
| Spada | 5000 | infinito | fendente ad arco (~2,5 m, ~100°) che colpisce più nemici, danno ~250, ~0,6 s tra i colpi |
| Mitra a tripletta | 2500 | 30 / 300 | 3 colpi a pressione, danno ~40 per colpo, precisa |
| Uzi doppia | 2000 | 50 / 400 | due mitragliette, cadenza altissima, danno ~13, dispersione alta, ricarica lenta |
| Raygun | non in vendita | 20 / 160 | proiettili verdi luminosi veloci (non istantanei), esplosione verde raggio ~2,5 m, danno ~300 ad area |

- Coltello e spada: animazione del fendente, suono "swish", niente munizioni né ricarica; il colpo
  spinge un po' i nemici. Su touch si usano con "Spara", sul controller con RT
- Uzi doppia: nel modello in prima persona si vedono due armi, una per mano
- Raygun: luce e suono speciali quando esce dalla cassa; le sue munizioni si ricaricano solo alla
  bancarella delle munizioni. Le proprie esplosioni non fanno male (come le altre)
- Tutte le nuove armi si possono potenziare (2 livelli, strisce viola, poi viola e arancione)

**Cassa misteriosa con rarità** (non più uniforme):
- comuni: fucile a pompa, mitra, fucile d'assalto, mitra a tripletta, uzi doppia, coltello
- meno comuni: cecchino, lanciagranate, spada
- rara: bazooka
- rarissima: **raygun, ~2%**
- non esce un'arma che hai già in mano

**Munizioni di riserva raddoppiate** per tutte le armi esistenti (anche potenziate): pompa 30 → 60,
mitra 150 → 300, assalto 150 → 300, cecchino 25 → 50, lanciagranate 24 → 48, bazooka 8 → 16.

**Bancarella delle munizioni**: la bancarella POPCORN vicino all'ingresso LUNA PARK diventa
"MUNIZIONI". Prima del round 10 ha la saracinesca abbassata con la scritta "Apre al round 10".
Dal round 10 ricarica **al massimo tutte le armi che hai** (raygun compresa) per **4500 punti**.
Il negozio continua a vendere le munizioni della singola arma.

**Cura completa** nel negozio: riporta la vita al massimo, **2000 punti**, **una volta per round**.
Il potenziamento "Vita massima +25" resta com'è.

#### Valori attuali (passo 3, in `src/weapons/defs.js`)

| Arma | Prezzo | Caricatore / riserva | Danno | Note |
|---|---|---|---|---|
| Coltello | 300 | ∞ | 60 (testa ×2) | portata 1,6 m, un colpo ogni 0,42 s |
| Spada | 5000 | ∞ | 250 | arco di 100°, portata 2,5 m, colpisce tutti i nemici nell'arco, 0,6 s |
| Mitra a tripletta | 2500 (munizioni 700) | 30 / 300 | 40 | 3 colpi a pressione (0,065 s tra uno e l'altro), 0,42 s tra le raffiche |
| Uzi doppia | 2000 (munizioni 600) | 50 / 400 | 13 | un colpo ogni 0,05 s, le due armi sparano a turno, dispersione alta, ricarica 2,8 s |
| Raygun | solo cassa | 20 / 160 | 300 ad area (2,5 m) | palla verde a 46 m/s, esplode appena tocca qualcosa |

- Coltello e spada: il colpo è un ventaglio di raggi corti (2 file, una dritta e una un po' più in basso);
  ogni nemico si colpisce una volta per fendente e viene spinto. Fendente animato (una volta da destra,
  una da sinistra), suono "swish". Niente munizioni né ricarica: il contatore mostra ∞.
- Raygun: le munizioni non si trovano a terra né al negozio, solo alla bancarella delle munizioni.
  Esplosione verde con luce verde; le proprie esplosioni spingono ma non fanno male.
- Cassa misteriosa: pesi comuni 10 (pompa, mitra, assalto, tripletta, uzi, coltello), meno comuni 5
  (cecchino, lanciagranate, spada), rara 2 (bazooka), raygun 1,5. Con pistola e mitra in mano la raygun
  esce circa il 2% delle volte (misurato su 100 000 estrazioni). Quando esce: luce verde, scintille
  verdi, arpeggio e scritta "RARISSIMA!".
- Tutte si potenziano col potenziatore come le altre (danno, caricatore, cadenza; strisce viola e arancione).

#### Valori attuali (passo 2)
- Munizioni di riserva raddoppiate in `src/weapons/defs.js` (anche le armi potenziate, che le moltiplicano).
- **Bancarella delle munizioni**: è la prima bancarella a sinistra del viale del luna park (dove c'era
  POPCORN). Fino al round 9 ha una saracinesca grigia "CHIUSO · Apre al round 10"; all'inizio del
  round 10 si arrotola verso l'alto. Ci si avvicina al banco e si compra come la cassa misteriosa
  (B, pulsante d'azione "📦 Munizioni", tasto B del controller): 4500 punti, tutte le armi in mano al
  massimo. Se sono già piene non fa pagare. Prezzi in `AMMO_STALL` (defs.js).
- **Cura completa** nel negozio (💊): 2000 punti, vita al massimo, una volta per round (anche nella pausa
  tra un round e l'altro conta per il round appena giocato). Se la vita è già piena non si compra.
- **Montagne russe**: dopo il primo giro il trenino si ferma in stazione per 8 s. Si può scendere e salire;
  dalla cabina di comando "Avvia" riparte subito. Se a fine sosta non c'è nessuno a bordo, la corsa finisce.
- In multiplayer decide l'host (round, punti, cura una volta per round per ogni giocatore).

**Prestazioni prima di tutto**: anche su un MacBook Air M5 con qualità Alta il gioco non è fluido.
Prima delle novità si misura dove si perde tempo (CPU: fisica, nemici, percorsi, oggetti creati a
ogni fotogramma; GPU: effetti di schermo, ombre, risoluzione, chiamate di disegno) e si correggono
le cause principali. Obiettivo: 60 fps stabili in qualità Alta su un Mac recente, 30+ su iPhone.

#### Diagnosi e correzioni (passo 1)
Strumento: aggiungendo **`?prof`** all'indirizzo (es. `…/physics-playground/?prof`) sotto il contatore
compaiono i millisecondi di ogni parte del fotogramma (CPU: disegno, fisica, nemici, giostre, HUD…),
il fotogramma più lento (max), le chiamate di disegno e, dove il browser lo permette (Chrome sul
computer), il tempo della scheda grafica (GPU). Safari non dà il tempo GPU ("GPU n.d.").

Cosa pesava (misure nel browser headless, che non ha una scheda grafica: il disegno lo fa il processore,
quindi valgono le proporzioni, non i numeri assoluti):
- **CPU: poco.** 3–6 ms per fotogramma anche con 20 nemici (disegno ~2 ms, fisica ~1 ms, il resto
  sotto 0,5 ms). Su un M5 è ancora meno: il processore non era il problema.
- **GPU: quasi tutto, e cresceva con i pixel.** In Alta sul Mac si disegnava a 2× (Retina): su un
  MacBook Air 13" sono 5,6 milioni di pixel, con MSAA 4× in immagine HDR, bloom e ombre. Divisione del
  lavoro di disegno: ombre ~33%, effetti di schermo (MSAA, bloom, colori) ~43%, scena ~24%.
- Le ombre costavano soprattutto perché ogni pixel della mappa leggeva la mappa delle ombre, anche
  lontano dal giocatore o sulle facce in ombra, dove il risultato non si usa.
- Il canvas aveva anche un suo antialiasing MSAA, inutile quando l'immagine passa dagli effetti.
- Scatti: il ricalcolo dei percorsi dei nemici (~2–3 ms in un solo fotogramma, ogni volta che il
  giocatore cambia "quadretto" della griglia). Il raggio del mirino contro tutti i pezzi dei nemici a
  ogni fotogramma. Piccoli oggetti creati a ogni fotogramma (bersagli dei nemici).

Cosa è cambiato:
- Risoluzione sul computer: Alta 1,5× (era 2×) e al massimo 3,4 milioni di pixel; Media 1,25× e
  2,6 milioni; Bassa 1× e 2,2 milioni. Su schermi grandi la risoluzione scende da sola entro il tetto.
  Telefoni e tablet invariati.
- Canvas senza antialiasing proprio (lo fanno gli effetti: MSAA in Alta, FXAA in Media).
- Ombre: la mappa delle ombre si legge solo entro ~21 m e sulle facce al sole. Le braccia dei nemici
  non fanno ombra (2 disegni in meno per nemico).
- Percorsi dei nemici calcolati a pezzi su più fotogrammi (~0,15 ms l'uno invece di ~2,2 ms tutti
  insieme); nel frattempo i nemici seguono il percorso precedente.
- Mirino (cosa si può afferrare) controllato 15 volte al secondo; bersagli dei nemici riusati;
  testo delle giostre riscritto solo quando cambia.

Misure (headless, risoluzione MacBook Air 1470×956 a 2×, qualità Alta):

| | Prima | Dopo |
|---|---|---|
| Lavoro di disegno, partenza | 2750 ms | 1250 ms (−55%) |
| Lavoro di disegno, 20 nemici | 2720 ms | 1530 ms (−44%) |
| Chiamate di disegno, 20 nemici | 440 | 385 |
| fps headless (partenza / 20 nemici) | 0,4 / 0,4 | 0,7 / 0,7 |
| Ricalcolo percorsi | 2,2 ms in un fotogramma | 9 pezzi da 0,15 ms |

Gli fps veri del Mac si leggono solo sul Mac, con il contatore (e `?prof`).

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
- Su telefono e iPad si compra e si interagisce col **pulsante d'azione** contestuale, sotto il
  pollice destro (vedi "Piattaforme" → "Controlli touch")

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

#### Valori attuali (passo 3)
- Manifesti a fine partita (`src/faces/poster.js`, disegnati in un canvas): "Il più eliminato" e
  "Il tuo assassino", solo per i volti con un nome
- Boss: testa ×1,35 (invece di rimpicciolirsi come negli altri nemici grossi); ogni 0,2 s un raggio
  verso l'alto misura il soffitto e la testa si riduce fino a starci (minimo ×0,5). Nome grande sopra
  la testa, visibile entro 45 m, e "👹 Arriva il boss: NOME!"
- Manifesti sui muri (`src/world/posters.js`): 5 per zona, almeno 7 m l'uno dall'altro, a 1,7 m da
  terra, solo su muri dritti e larghi; mai sulla zona sicura né sul muro del passaggio segreto.
  Usano i volti della galleria (o le facce disegnate se è vuota)
- Volto del giocatore (`src/faces/myface.js`): selfie o galleria, ritaglio automatico come in galleria.
  L'host riceve i volti condivisi e li manda a tutti all'inizio della partita, insieme a quelli
  degli zombi; i client li tengono solo in memoria

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
2. **Luna park** (48×72 m, al centro; dalla fase 9 al posto del parco giochi): arco d'ingresso,
   viale con bancarelle, piazza rotonda con la partenza, la palla demolitrice e il negozio in un
   edificio; aree per le giostre; ai lati le piazzole dei giochi di sempre (torrette con scivolo,
   altalene, sabbiera, piscina di palline, fortino di casse, arrampicata, trampolini, giostra e
   dondolo, palle giganti, piramide di casse, alberi e panchine). Dettagli più sotto
3. **Backrooms** (30×72 m, a est del luna park): un unico labirinto di corridoi gialli con moquette e neon (qualcuno spento),
   qualche salone più grande, sedie e casse abbandonate

- **Seed**: un numero decide i dettagli (labirinto, auto, quali giochi e dove, porte).
  Stesso seed = stessa mappa. In multiplayer l'host manda solo il numero
- **Passaggi**: 3 varchi tra parcheggio e luna park, 3 porte tra luna park e backrooms
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

#### Valori attuali (passo 1, in `src/world/lunapark.js`)
- Mappa intera 108×72 m: parcheggio x −45…−15, luna park x −15…33, backrooms x 33…63
- Pianta del luna park (il nord è −z, come nella minimappa), asse del viale a x = 10:
  - **Piazza** rotonda (raggio 10 m) al centro, con la palla demolitrice; partenza a sud del portale
  - **Negozio** sul lato nord della piazza: il chiosco di prima dentro un edificio rosa con
    torrette, frontone, lampadine e la scritta "ARMI & MUNIZIONI"
  - **Viale** largo 6 m verso sud, con lampioni e festoni di lampadine; ai lati due zone ristoro
    con 4 bancarelle (popcorn, zucchero filato, bibite, gelati), tavolini e alberi
  - **Arco d'ingresso** in fondo al viale: due torrette-biglietteria, insegna "LUNA PARK" luminosa
  - **Aree delle giostre** a nord (oltre il vialetto): ruota panoramica a ovest, stazione delle
    montagne russe a est
  - **Giochi** in 10 piazzole: 4 per lato più 2 vicino all'ingresso (scelti e mescolati dal seed)
- Le scritte delle insegne sono texture disegnate in un canvas (`src/world/signs.js`)

#### Valori attuali (passo 2: ruota panoramica, in `src/world/wheel.js` e `src/game/rides.js`)
- Ruota di raggio 9,5 m con 8 cabine, mozzo a circa 12 m: la cabina più alta arriva a ~20 m
  (sopra i muri di 11 m). Piano della ruota lungo x, gambe ad A davanti e dietro, recinto con varco
- **Salire**: ci si avvicina a una cabina libera che sfiora la pedana (anche con la ruota in moto
  lento) → pulsante "Sali" (tasto F). Seduti si guarda e si spara, non si cammina
- **Scendere**: "Scendi" (F). Se la cabina è in basso si scende sulla pedana; se è in alto si salta
  giù (nessun danno da caduta). A fine corsa la ruota gira piano e fa scendere chi passa in basso
- **Cabina di comando** davanti a destra: "Avvia/Ferma" (G) e "Velocità 1-2-3" (V).
  Velocità 0,10 / 0,17 / 0,26 rad/s (un giro in circa 63 / 37 / 24 s); la corsa dura 75 s
- **Avvio ritardato**: se nessuno è seduto, "Avvia" aspetta 6 secondi per correre a sedersi
- Da ferma la ruota si allinea da sola con una cabina sulla pedana
- Dall'alto la nebbia si allontana (fino a ~110 m) e si vede tutta la mappa
- Le cabine non hanno collider: chi è seduto segue il posto da programma (corpo senza gravità e
  senza collisioni). I nemici non salgono: restano dove si è saliti e colpiscono solo quando la
  cabina passa in basso
- Multiplayer: l'host decide angolo, velocità, stato e posti e li manda nelle istantanee; i client
  chiedono "sali/scendi/avvia/ferma/velocità" e correggono piano l'angolo

#### Valori attuali (passo 3: montagne russe, in `src/world/coaster.js` e `src/game/rides.js`)
- Percorso chiuso di circa 280 m (curva Catmull-Rom con 26 punti; altezze della cima e della gobba
  e alcune curve cambiano con il seed). In ordine: stazione nel luna park (in piano, lungo x),
  salita a catena fino a ~21 m sopra le backrooms, discesa e gobba, curva verso ovest, passaggio a
  ~14 m sopra il luna park (sul vialetto a z = 24), grande curva sopra il parcheggio (≥ 12 m, sopra
  i lampioni del tetto), ritorno basso lungo il muro nord, frenata e stazione
- Trenino di 3 vagoni da 2 posti (6 posti). Si sale solo con il treno fermo in stazione ("Sali", F);
  in corsa "Scendi" non si può. **Fase 12**: alla fine del primo giro il treno rallenta e si ferma in
  stazione per ~8 s con conto alla rovescia ("Riparte tra 8…"): chi vuole scende (e chi vuole può
  salire), poi riparte per il secondo giro. A fine corsa si ferma e tutti scendono sulla banchina
- Comandi nella casetta viola a est della banchina: "Avvia" (G), "Ferma" (si ferma alla prossima
  stazione: in aria non si frena), "Velocità 1-2-3" (V). Avvio ritardato di 6 s se nessuno è seduto
- Una corsa = 2 giri. Velocità: catena 2,8 / 3,5 / 4,5 m/s; in discesa conta l'altezza persa
  (√(3,5² + 2·g·dislivello) × 0,8 / 1 / 1,15, massimo 22 m/s ≈ 80 km/h); 6 m/s nella frenata prima
  della stazione, 4 m/s in stazione
- Binari, traversine, trave centrale e sostegni sono fermi: stanno nella geometria unita della mappa
  (stesso vantaggio dell'instancing, nessuna chiamata di disegno in più). Sostegni ogni ~5 m: a
  terra nel luna park (ma non su giochi, piazza, viale, bancarelle, ruota), sul tetto del parcheggio
  (lontano da auto, lampioni e rampa), sul soffitto delle backrooms. Si muovono solo i 3 vagoni
- Il percorso si vede nella minimappa come linea viola
- Misure headless 844×390: ~60 chiamate di disegno a fotogramma in piazza, ~85 dalla cima della
  ruota con la vista lunga, ~20-25 sopra il parcheggio e in stazione

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
- **Controller** (Xbox, PlayStation e simili, collegati via Bluetooth): su iPad, telefono e computer

### Controlli touch: pulsanti e pulsante d'azione
Pulsanti ad arco nell'angolo in basso a destra, tutti alla stessa distanza da "Spara", così il
pollice li raggiunge ruotando:

| Posizione | Pulsante | Quando c'è |
|---|---|---|
| Angolo | **Spara** (il più grande) | Sempre |
| A sinistra di Spara | **Salta** | Sempre |
| In diagonale, tra Salta e l'azione | **Ricarica** | Sempre |
| Sopra Spara | **Pulsante d'azione** | Solo se c'è qualcosa vicino |
| Secondo giro, sopra Ricarica | **Mirino** | Solo col cecchino |

**Regola del pulsante d'azione** (come B sul controller): non c'è un pulsante fisso "Afferra".
Il pulsante d'azione compare **solo quando c'è qualcosa con cui interagire** e cambia icona e nome;
se non c'è niente vicino resta nascosto. Quando compare (o cambia azione) fa una piccola
animazione (si gonfia e lancia un anello) per farsi notare.

| Dove sei | Pulsante | Cosa fa |
|---|---|---|
| Al banco del negozio | 🛒 **Compra** / ✕ **Chiudi** | Apre il pannello del negozio (poi si tocca l'oggetto); premuto di nuovo lo chiude |
| Alla cassa misteriosa (zona sicura) | 🎁 **Cassa** | Compra subito un giro della cassa |
| Al potenziatore (zona sicura) | 🔮 **Potenzia** | Potenzia subito l'arma in mano |
| Vicino a un posto libero di una giostra | 🪑 **Sali** | Ti siedi |
| Seduto su una giostra | ⬇️ **Scendi** | Ti alzi |
| Alla cabina di comando | ▶️ **Avvia** / ⏹️ **Ferma** | Accende o spegne la giostra (la velocità resta nel pannello) |
| Mirando una cassa o una palla vicina | ✋ **Afferra** | La prende |
| Con un oggetto in mano | 🤾 **Lancia** | La lancia dove guardi (anche "Spara" la lancia) |

Se valgono più cose insieme vince, nell'ordine: Scendi, Lancia, giostra (cabina o posto),
negozio/cassa/potenziatore, Afferra. In multiplayer i client non afferrano (gli oggetti li muove
l'host), quindi per loro Afferra/Lancia non compare.

### Controller (fase 11)
Usa la Gamepad API del browser. Il controller si attiva da solo appena si preme un tasto
(Safari mostra il controller solo dopo la prima pressione: il menu lo dice con "Premi un tasto
del controller").

| Comando | Azione |
|---|---|
| Levetta sinistra | Muoversi (premuta = corsa) |
| Levetta destra | Guardare |
| RT (grilletto destro) | Sparare |
| LT (grilletto sinistro) | Mirino / zoom del cecchino |
| A | Salto |
| X | Ricarica |
| Y | Cambia arma (successiva) |
| B | Interagisci: negozio, cassa, potenziatore, afferra, sali/scendi dalle giostre |
| LB / RB | Arma precedente / successiva |
| Croce direzionale | Armi 1-2-3 e navigazione nei menu |
| Menu (≡) | Pausa |
| Visualizza (⧉) | Statistiche della partita |

- **Levetta destra comoda**: zona morta, curva di risposta (piano per mirare, veloce a fondo corsa),
  sensibilità regolabile nelle impostazioni; leggero aiuto alla mira solo con il controller
- **Menu usabili col controller**: selezione evidenziata, A conferma, B indietro (menu iniziale,
  lobby, galleria volti, negozio, pausa, impostazioni, fine partita)
- **HUD**: quando si usa il controller spariscono i pulsanti touch e i suggerimenti mostrano i
  tasti del controller ("B Compra", "A Salta"); se si tocca lo schermo tornano i controlli touch
- Vibrazione quando si spara o si viene colpiti, se il browser la supporta
- In multiplayer ogni giocatore usa il controller del proprio dispositivo

### Mouse su iPad
Safari su iPad **non supporta il "pointer lock"** (il mouse catturato dal gioco), quindi con il
mouse la visuale si muove solo trascinando. Finché Apple non lo aggiunge, su iPad il modo
consigliato è il controller. Il gioco deve provare a usare il pointer lock anche su iPad quando
si usa un mouse (se un giorno Safari lo supporta, funzionerà da solo) e altrimenti tenere il
trascinamento.


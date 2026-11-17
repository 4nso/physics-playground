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

| Arma | Ruolo | Note |
|---|---|---|
| Pistola | Base, colpi infiniti | Precisa, cadenza media |
| Fucile a pompa | Distanza ravvicinata | Più pallini, rinculo forte, spinge i nemici |
| Mitra | Fuoco continuo | Si sblocca da un certo round o si raccoglie |

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

## Volti dei nemici (privacy prima di tutto)

Il repository e il sito sono pubblici, quindi **le foto non stanno mai nel progetto**.

- Nel menu c'è una **galleria volti**: "Aggiungi volti" apre il selettore di foto del
  dispositivo (rullino dell'iPad/telefono), con selezione multipla
- Ogni foto viene ridimensionata nel browser a 256×256, con un ritaglio quadrato
  centrato e regolabile (trascina e zoom per centrare il viso)
- Le foto restano **solo nel browser** del giocatore (IndexedDB) e si possono
  eliminare una a una o tutte insieme
- Nessuna foto viene mai inviata a un server
- In multiplayer l'host invia i volti della sua galleria **direttamente** ai giocatori
  della stanza, tramite la connessione PeerJS. I client li tengono solo in memoria per
  quella partita, senza salvarli

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

## Piattaforme

- iPad e telefono: controlli touch (joystick e pulsanti), 30 fps stabili come minimo
- Desktop: tastiera e mouse con pointer lock

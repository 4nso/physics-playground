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

Un mondo grande e "a stanze", in stile **backrooms giocoso e un po' surreale**: gli ambienti
non devono avere molto senso tra loro, anzi è voluto. Si passa da un corridoio con la carta da
parati gialla e i neon a una piscina coperta vuota, poi a un parcheggio all'aperto o a un parco giochi.

- **Moduli**: la mappa è una griglia di riquadri (15×15 m). Ogni riquadro è una stanza o
  un'area esterna di un certo tipo: corridoi gialli, uffici vuoti, piscina coperta,
  parcheggio, parco giochi/cortile (in seguito: scale verso stanze strane, cantine, tetti…)
- **Generatore con seed**: un numero ("seed") decide tutto: disposizione, tipi di stanza,
  porte, oggetti. Stesso seed = stessa mappa. In multiplayer l'host sceglie il seed e lo manda
  ai client, che costruiscono la stessa mappa senza scaricare niente
- **Collegamenti**: tra i riquadri ci sono porte, varchi o muri; tutti i riquadri sono
  raggiungibili. Tra due aree esterne il passaggio può essere aperto del tutto
- **Più livelli di altezza**: scale e rampe, soppalchi e balconi, la vasca della piscina più in basso
- **Nemici che navigano**: una griglia di navigazione (celle da 1 m, anche su più piani) calcolata
  dalla geometria; i nemici seguono il percorso più breve verso il giocatore più vicino
  (aggirano muri, salgono le scale)
- **Comparsa dei nemici**: in punti distribuiti nella mappa, lontani e fuori dalla vista dei giocatori
- **Oggetti fisici sparsi**: casse e palloni nelle stanze, la palla demolitrice nella piazza di partenza
- **Orientarsi**: minimappa in alto a sinistra che ruota con la visuale (compagni in blu, nemici vicini in rosso)
- **Prestazioni**: la geometria statica di ogni riquadro è unita in un'unica mesh; niente luci
  per le stanze (la luce è "dipinta" nei colori dei vertici), nebbia e distanza di disegno limitata
  per non disegnare tutta la mappa. Obiettivo 30+ fps su iPhone

## Piattaforme

- iPad e telefono: controlli touch (joystick e pulsanti), 30 fps stabili come minimo
- Desktop: tastiera e mouse con pointer lock

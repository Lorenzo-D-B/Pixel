# Guida completa — Pixel Guard for Gmail

Userscript **Tampermonkey**, senza server o servizi esterni, per filtrare le immagini nelle email di Gmail desktop. Il file da installare è **[pixel-guard.user.js](https://raw.githubusercontent.com/Lorenzo-D-B/Pixel/main/pixel-guard.user.js)**; npm serve soltanto a chi vuole eseguire i test. [Torna alla presentazione](../README.md).

## Installazione

1. Installa e abilita [Tampermonkey](https://www.tampermonkey.net/) nel browser.
2. Apri il [link di installazione](https://raw.githubusercontent.com/Lorenzo-D-B/Pixel/main/pixel-guard.user.js). Tampermonkey dovrebbe mostrare la schermata per installare **Pixel Guard — Gmail**: scegli **Installa**.
3. Se il browser mostra soltanto il codice, in Tampermonkey scegli **Crea un nuovo script**, sostituisci tutto il contenuto dell'editor con `pixel-guard.user.js`, inclusa l'intestazione `// ==UserScript==`, e salva.
4. Ricarica completamente Gmail. Se Tampermonkey segnala che l'esecuzione degli userscript è disabilitata nel browser, abilitala seguendo le indicazioni dell'estensione.
5. Cerca il pannello **Pixel Guard** in basso a sinistra. Il contatore indica le immagini neutralizzate nel DOM attualmente aperto.

L'interfaccia dello script è in italiano. Tampermonkey può controllare gli aggiornamenti tramite gli URL GitHub dichiarati nello script. Le nuove versioni e le relative note sono elencate nelle [release](https://github.com/Lorenzo-D-B/Pixel/releases).

**Per una protezione più forte, attiva anche l'impostazione nativa di Gmail:** Impostazioni → Visualizza tutte le impostazioni → Generali → Immagini → **Chiedi prima di visualizzare immagini esterne**, quindi salva. Questa impostazione resta importante perché uno userscript non può garantire di intercettare ogni richiesta prima del browser.

## Come funziona

In **Protezione immagini** puoi scegliere:

| Modalità                                       | Cosa blocca                                                                                                                                            |
| ---------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| Piccole + dimensioni sconosciute — predefinita | Immagini con larghezza **e** altezza dichiarate ≤ 10 px, immagini nascoste e immagini senza entrambe le dimensioni verificabili prima del caricamento. |
| Solo piccole                                   | Immagini con entrambe le dimensioni dichiarate ≤ 10 px e immagini nascoste. Le dimensioni sconosciute vengono lasciate caricare.                       |
| Tutte le immagini remote                       | Tutte le immagini HTTP(S) riconosciute come appartenenti al messaggio, indipendentemente dalle dimensioni.                                             |

La soglia include **10×10**. Un'immagine dichiarata 10×11 non è classificata come piccola. Uno zero esplicito, `hidden`, `display:none` o `visibility:hidden` inline la fanno classificare come nascosta. Sono lette le dimensioni HTML `width`/`height` e quelle CSS inline in pixel; percentuali e dimensioni naturali sconosciute non sono usate per autorizzare il download. Se attributi e stile differiscono viene usato il valore esplicito più piccolo.

Le immagini bloccate sono sostituite da un pulsante **Mostra immagine**, con il motivo del blocco. Il clic autorizza soltanto quell'immagine e può comunicare l'apertura dell'email al mittente. Se Gmail riusa l'elemento con un nuovo URL, l'autorizzazione viene revocata. Lo sblocco non viene memorizzato dopo una ricarica.

La modalità scelta è salvata nel `localStorage` di Gmail, nello stesso browser/profilo, ed è condivisa tra gli account Gmail aperti in quel profilo. Se lo storage non è disponibile, vale soltanto per la scheda corrente. Passare a una modalità meno restrittiva può caricare immediatamente immagini precedentemente bloccate. Passare a una più restrittiva non annulla richieste già avvenute o uno sblocco manuale già concesso.

Lo script riconosce i contenitori dei messaggi Gmail (`.a3s`, `.ii.gt`) e gli URL del proxy immagini `ci*.googleusercontent.com`. Non intende filtrare avatar e immagini dell'interfaccia Gmail. Gestisce `img.src`, `img.srcset`, i `source` di `picture` e diversi percorsi di inserimento HTML/DOM. Non effettua richieste di prova, `HEAD`, telemetria o invii a un proprio servizio. Gli URL originali restano nella memoria della pagina per permettere lo sblocco; non sono copiati nel `localStorage`.

## Limiti da conoscere

- **Le dimensioni dichiarate non identificano con certezza un tracker.** Un pixel reale 1×1 può dichiarare 600×300; anche un banner legittimo può tracciare. Per conoscere le dimensioni naturali bisognerebbe prima scaricarlo. Usa la modalità “Tutte” e l'impostazione nativa Gmail se preferisci un filtro più restrittivo.
- **Un'immagine nascosta dopo il download ha già potuto tracciare.** Lo script esegue controlli sincroni prima dei setter e degli inserimenti che riesce a intercettare; il `MutationObserver` è soltanto una rete di recupero. Le immagini presenti nell'HTML iniziale, il preload scanner, un'iniezione tardiva dell'estensione, modifiche tramite API non intercettate o immagini dirette precaricate fuori dal contenitore del messaggio possono avviare richieste prima del blocco. Il contatore non dimostra che nessuna richiesta sia partita.
- Le scritture `TrustedHTML` e le policy Trusted Types imposte da Gmail sono rispettate: non viene creata una policy permissiva per aggirarle. Su quei percorsi HTML l'osservazione successiva non garantisce un blocco preventivo. I setter delle immagini restano intercettati quando disponibili.
- CSS `background-image`, SVG, video, link tracciati, notifiche di lettura e altre tecniche diverse dalle immagini HTML gestite non sono coperti. Non è un ad blocker né un filtro di rete.
- Gmail è un'applicazione che cambia nel tempo. I selettori e l'intercettazione delle API DOM possono richiedere aggiornamenti e, in caso di incompatibilità, lo script può essere disabilitato in Tampermonkey e Gmail ricaricato.
- La validazione automatica usa una **simulazione di Gmail in Chromium**, senza accesso a una casella personale. L'iniezione effettiva di Tampermonkey e la compatibilità con il Gmail del tuo account richiedono ancora una prova nel tuo browser. Non è dichiarata una validazione su Firefox.

## Sviluppo e test

Non è necessario compilare lo userscript: `pixel-guard.user.js` è già il file distribuibile.

```bash
git clone https://github.com/Lorenzo-D-B/Pixel.git
cd Pixel
npm ci
npm run check
CHROMIUM_PATH=/usr/bin/chromium npm test
```

Per lo sviluppo è consigliato Node.js 24 LTS. Nell'ambiente cloud preparato, Chromium è già presente. Su un'altra macchina puoi installare il Chromium gestito da Playwright con `npx playwright install --with-deps chromium`, quindi eseguire `npm test` senza `CHROMIUM_PATH`.

I test controllano le **richieste di rete**, oltre all'interfaccia: pixel 1×1/10×10, immagini grandi o senza dimensioni, `srcset`/`picture`, inserimenti dinamici, scritture degli attributi, sblocco manuale, riuso degli elementi, immagini dell'interfaccia Gmail, cambio modalità, persistenza e Trusted Types. Tutti gli URL delle email sono intercettati e simulati dal runner; non si contattano i mittenti reali. Un test separato dimostra esplicitamente il limite delle richieste già iniziate dal parser.

Il repository non richiede credenziali Gmail o altri segreti. Non aprire una casella personale per eseguire la suite automatica.

## Risoluzione dei problemi

- **Il pannello non compare:** controlla che Tampermonkey e lo script siano attivi, verifica l'autorizzazione del browser a eseguire userscript e ricarica la scheda. Lo script si applica a `https://mail.google.com/*` nel documento principale.
- **Un'immagine utile è bloccata:** premi **Mostra immagine** per autorizzarla, oppure scegli una modalità meno restrittiva. Entrambe le azioni possono caricare immagini remote e comunicare l'apertura del messaggio.
- **Il blocco sembra non funzionare:** attiva anche la richiesta preventiva delle immagini nelle impostazioni native Gmail. Il contatore dello script non prova l'assenza di richieste già partite; controlla i limiti sopra.
- **Gmail si comporta in modo anomalo:** disabilita temporaneamente lo script e ricarica. Segnala il problema con versioni di browser e Tampermonkey e un esempio sintetico, senza pubblicare messaggi personali o URL di tracciamento.

Per rimuoverlo, elimina o disabilita **Pixel Guard — Gmail** dalla dashboard Tampermonkey e ricarica Gmail. La preferenza salvata può essere rimossa dalla console della pagina con `localStorage.removeItem("pixel-guard:mode:v1")`; non è necessario cancellare tutti i dati di Gmail.

# Changelog

## [0.1.0] — 2026-11-04

Prima versione pubblica di **Pixel Guard for Gmail**.

- Userscript Tampermonkey pronto da installare su Gmail desktop.
- Tre modalità: immagini piccole (fino a 10×10 px), piccole più dimensioni sconosciute, oppure tutte le immagini remote riconosciute nel messaggio.
- Riconoscimento delle immagini nascoste, supporto `srcset` e `picture`.
- Sblocco manuale per singola immagine e revoca dell'autorizzazione quando cambia l'URL.
- Pannello in italiano con contatore e preferenza salvata localmente.
- Intercettazione dei principali setter/inserimenti DOM e recupero con `MutationObserver`, senza richieste esplorative per misurare le immagini.
- 16 test browser su Gmail simulato, inclusa la dimostrazione del limite dei caricamenti avviati dal parser.
- Guida italiana, documentazione inglese, screenshot dimostrativo e licenza MIT.

Limiti: non garantisce il blocco di ogni tracciamento o di richieste già partite; non copre CSS, SVG e link tracciati. Consigliato l'uso con l'opzione nativa Gmail **Chiedi prima di visualizzare immagini esterne**.

[0.1.0]: https://github.com/Lorenzo-D-B/Pixel/releases/tag/v0.1.0

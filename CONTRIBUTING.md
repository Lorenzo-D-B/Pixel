# Contribuire a Pixel Guard / Contributing

Sono benvenute segnalazioni e proposte in **italiano o inglese**.

## Segnalare un problema

Apri una [issue](https://github.com/Lorenzo-D-B/Pixel/issues) indicando:

- Browser, sistema operativo, versioni di Tampermonkey e Pixel Guard.
- Modalità di blocco e impostazione nativa Gmail per le immagini.
- Passaggi per riprodurre il problema, risultato atteso e risultato osservato.
- Quando possibile, un piccolo esempio HTML sintetico che dimostri il problema.

Non allegare email private, cookie, credenziali o URL di tracking personali. Non confondere la rimozione visiva di un'immagine con la prevenzione della sua richiesta di rete.

## Proporre una modifica

1. Lavora su un fork o su un branch dedicato.
2. Esegui `npm ci`, `npm run check` e `npm test` con Chromium disponibile. Vedi il [README](README.md#sviluppo) per installare il browser.
3. Per le modifiche al blocco, aggiungi un test che controlli le richieste di rete, non soltanto l'interfaccia.
4. Mantieni lo script distribuibile come singolo file, senza telemetria, richieste di prova ai tracker o dipendenze runtime esterne.
5. Aggiorna la documentazione se cambia un comportamento visibile. Apri una pull request descrivendo il problema risolto e i controlli eseguiti.

I contributi sono distribuiti con la stessa [licenza MIT](LICENSE) del progetto.

## English

Issues and pull requests are welcome in Italian or English. Include browser/OS, Tampermonkey and userscript versions, the selected blocking mode, Gmail's image setting, reproduction steps and expected/actual behavior. Use synthetic HTML examples and remove private mail, cookies, credentials and personal tracking URLs.

Install dependencies with `npm ci`, run `npm run check`, install Chromium as described in the [English README](README.en.md#testing-and-development), and run `npm test`. Blocking changes should include network assertions, not just visibility checks. Keep the userscript self-contained and free of telemetry or image-probing requests. Update documentation when behavior changes. Contributions use the project's MIT license.

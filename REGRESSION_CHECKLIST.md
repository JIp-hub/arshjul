# Regressions-checklista – Årshjulet (snabbtest)

Kör denna lista innan du börjar på en ny feature och efter varje större ändring.

## 0) Start
- [ ] Öppna `index-dev.html` i webbläsare (samma sätt som du normalt testar).
- [ ] Öppna DevTools Console.
- [ ] Console: 0 fel (inga röda errors).

## 1) Basrender
- [ ] Sidan laddar utan att layouten “hoppar”.
- [ ] Månadsektioner syns korrekt.
- [ ] Klick på dag/birthday öppnar overlay/modal där det ska.

## 2) Print (knapp + Arkiv → Skriv ut)
- [ ] Klick på Print-knapp ger korrekt printläge.
- [ ] Arkiv → Skriv ut (browsermeny) ger samma stabila printvy.
- [ ] Endast födelsedagar syns i print.
- [ ] Printlistan är stabil: 🎂-kolumnen svajar inte (dag 3 vs 30).

## 3) Kopiera födelsedagslista (modal + Cmd/Ctrl+C)
- [ ] Öppna “kopiera födelsedagslista”-modalen.
- [ ] Cmd+C/Ctrl+C kopierar utan fel.
- [ ] Klistra in i en text (t.ex. Notes) och kontrollera att formatet är rimligt.

## 4) Låsning av kontroller
- [ ] När låsning är aktiv: kontroller är gråade (body har `controls-locked`).
- [ ] Kontroller går inte att använda när de är låsta.
- [ ] När upplåst: kontroller fungerar normalt igen.

## 5) yearSelect och scrollhjul
- [ ] Scrollhjul över yearSelect ändrar inte värde.
- [ ] yearSelect kan fortfarande ändras avsiktligt (klick + välj).

## 6) Snabb sanity efter regressionfix
- [ ] Upprepa punkt 2 + 3 (print + kopiera) efter kodändring.
- [ ] Console fortfarande 0 fel.

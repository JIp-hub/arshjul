# Årshjulet

Årshjulet är ett privat familjeverktyg för gemensamma födelsedagar och händelser. V1 har ett cirkulärt årshjul och två kompletterande vyer som läser samma data.

## V1

- cirkulärt årshjul med tolv valbara sektorer i klockordning,
- aktuell och vald månad markerad,
- tydliga indikatorer för födelsedagar och händelser,
- månadspanel som visar valt innehåll direkt,
- hjul-, list- och översiktsvy samt årsval,
- årligen återkommande födelsedagar och årsfiltrerade händelser,
- Magic Link-inloggning med privata familjedata i Supabase,
- medlemshantering av egna händelser och adminhantering av alla händelser och födelsedagar,
- utskrift och kopiering av födelsedagar samt validerad import/export,
- stöd för mobil, tangentbord, dialogfokus och Escape.

V1 innehåller inte drag-/snurrrotation, Realtime, automatiska inbjudningar eller en familjeväljare. De ligger efter V1.

## Arkitektur

`index.html` är publiceringsfilen och innehåller gränssnittet samt den befintliga DataStore-gränsen. `js/supabase-adapter.js` kopplar gränsen till Supabase Auth och databasen. Samma normaliserade data används av hjulet, listan, översikten, dialogerna, kopieringen och utskriften.

Appen hämtar data vid start och efter varje skrivning. Realtime används inte. Utan Supabase-konfiguration kör appen den lokala reservlagringen med syntetisk demonstrationsdata; den publicerade V1-byggnaden ska alltid få Supabase-konfiguration via GitHub Actions.

Databasen består av `families`, `family_members`, `events` och `birthdays`. Row Level Security (RLS) är den faktiska behörighetsgränsen. Familjekod kan identifiera en familj men ger aldrig åtkomst.

## Integritet

Verkliga namn, födelsedatum, e-postadresser, familjehändelser, exporter och backuper ska aldrig checkas in. Webbappen använder bara projektets publika URL och en publishable key; service role-, secret- och databasnycklar får aldrig finnas i klienten eller Git.

## Lokal körning

Starta en lokal webbserver i repo-roten och öppna `index.html`, exempelvis:

```sh
python3 -m http.server 8768 --bind 127.0.0.1
```

Den incheckade `supabase-config.js` är avsiktligt tom. En lokal Supabase-anslutning kan byggas till en ignorerad eller tillfällig fil med `scripts/build-supabase-config.mjs` och de tre publika variablerna i `.env.example`.

Aktuell driftsättning, Auth, RLS, bootstrap och datamigrering beskrivs i [SUPABASE_SETUP.md](SUPABASE_SETUP.md). [REGRESSION_CHECKLIST.md](REGRESSION_CHECKLIST.md) är V1:s kontrollista. `PHASE_B_PLAN.md` och `PROJECT_PLAN.md` är historiska beslutsunderlag.

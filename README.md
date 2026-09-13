# Årshjulet

Ett familjeverktyg för födelsedagar och händelser. Appen har lista och översikt, årsväljare, utskrift och lokal lagring.

Den stabila Fas A-versionen fungerar utan konfiguration. B1 förbereder en valfri Supabase-anslutning bakom samma DataStore-gräns. Se [SUPABASE_SETUP.md](SUPABASE_SETUP.md) för schema, RLS, Magic Link, bootstrap och datamigrering.

Öppna `index.html` via en lokal webbserver. Supabase-konfigurationen är tom som standard, så inga externa anrop görs innan B2 aktiveras.

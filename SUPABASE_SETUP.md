# Supabase B1 – lokal förberedelse

B1 innehåller all lokal kod och SQL som behövs inför en verklig anslutning. Inga migrationsfiler har körts mot Supabase, inga användare har skapats och inga Magic Links har skickats.

## Filer och ansvar

- `supabase/migrations/20260913062311_create_family_data_model.sql`: tabeller, index, explicita Data API-grants, RLS-policyer och privata behörighetshjälpare.
- `supabase/tests/family_rls_test.sql`: pgTAP-fall för medlem, admin och utomstående.
- `supabase/bootstrap/`: säker engångsbootstrap av första familjen och första admin.
- `js/supabase-adapter.js`: asynkron Supabase-implementation bakom befintlig DataStore-gräns. `@supabase/supabase-js` är låst till 2.116.0.
- `supabase-config.js`: incheckad, tom standardkonfiguration. Därför fortsätter appen använda Fas A:s lokala DataStore tills B2 aktiveras.
- `scripts/build-supabase-config.mjs`: skapar webbläsarkonfiguration från deployment-variabler och avvisar service role/secret keys.

## Nödvändiga variabler

| Variabel | Innehåll | Hemlig? |
|---|---|---|
| `ARSHJUL_SUPABASE_URL` | Projektets publika HTTPS-URL | Nej |
| `ARSHJUL_SUPABASE_PUBLISHABLE_KEY` | Supabase publishable key; legacy anon key kan användas vid behov | Nej, men den får bara ge åtkomst genom RLS |
| `ARSHJUL_AUTH_REDIRECT_URL` | Exakt publicerad GitHub Pages-adress | Nej |

`.env` och lokala bootstrapvärden ignoreras av Git. `service_role`, `sb_secret_...`, privata JWT:er och databaslösenord får aldrig finnas i webbappen, deployment-variablerna eller repot.

GitHub Pages saknar servermiljövariabler vid körning. I B2 bör en Pages-build skapa `supabase-config.js` med `scripts/build-supabase-config.mjs` från GitHub repository variables. Ett alternativ är att checka in projekt-URL och publishable key eftersom båda är offentliga klientvärden, men buildvarianten minskar risken att någon av misstag klistrar in en hemlig nyckel.

## Auth och första admin

Appen använder `signInWithOtp` med `shouldCreateUser: false`. Endast redan skapade Auth-konton kan därför begära en Magic Link från appen.

Första admin skapas så här i B2:

1. Skapa kontot manuellt i Supabase Authentication.
2. Kopiera `supabase/bootstrap/first_admin.example.sql` till den ignorerade filen `first_admin.local.sql`.
3. Fyll i kontots e-postadress och önskat visningsnamn.
4. Kör transaktionen en gång i SQL Editor.
5. Verifiera en familj och ett medlemskap med rollen `admin`.

Ingen bootstrapfunktion exponeras över Data API. Skriptet stoppar om familjen redan finns, om platshållare finns kvar eller om Auth-användaren saknas.

## Behörighetsmodell

V1 antar en familj per användare. `family_members.user_id` är därför unik. Om flera familjer per användare ska stödjas senare måste denna begränsning tas bort och en familjeväljare införas i UI:t.

- Alla fyra tabeller har RLS.
- `anon` saknar samtliga tabellgrants.
- Inloggad medlem får läsa sin familj, medlemsnamnen, familjens händelser och födelsedagar.
- Händelser skapas alltid med den inloggades `auth.uid()` som ägare.
- Ägaren får ändra/radera sin händelse; admin får ändra/radera alla familjens händelser.
- Endast admin får skriva födelsedagar.
- `invite_code` förekommer inte i någon policy. Koden identifierar en familj men ger ingen åtkomst.
- Medlemskap och roller ändras endast med betrodd databasbehörighet i V1.

Behörighetskontrollerna i UI:t speglar reglerna för begriplighet. Databasen och RLS är den slutliga säkerhetsgränsen.

## DataStore och laddning

Utan konfiguration kör appen oförändrat med lokal DataStore. Med giltig konfiguration:

1. klienten läser befintlig Auth-session,
2. hämtar användarens `family_members`-rad,
3. hämtar medlemsnamn, händelser och födelsedagar,
4. lagrar resultatet i adapterns minnescache,
5. låter befintlig lista, översikt, overlay, kopiering och utskrift läsa samma normaliserade objekt som tidigare.

Skrivoperationerna är asynkrona och följs av ny hämtning. Realtime används inte.

## Engångsmigrering av data

### Födelsedagar

Admin använder den befintliga JSON-importen. I Supabase-läge är importen additiv, validerar varje verkligt kalenderdatum, hoppar över poster som redan finns och raderar aldrig serverdata. Den privata JSON-filen ska ligga utanför Git.

### Lokala händelser

Lokala händelser behöver migreras eftersom `localStorage` inte delas mellan enheter. Efter inloggning visas en särskild knapp när den aktuella lokala familjebucketen innehåller händelser. Alla importerade poster ägs av den inloggade användaren, dubbletter hoppas över och den lokala kopian bevaras som rollback. Varje användare ska bara importera händelser som personen själv ska äga.

## B2

1. Skapa projektet och kontrollera region samt personuppgiftsvillkor.
2. Konfigurera Site URL, redirect-URL och e-postleverans, behåll automatisk signup avstängd och kontrollera Magic Link-mallen.
3. Kör migrationen i en ny tom miljö och kör databassäkerhetskontroller/advisors.
4. Kör `supabase test db` lokalt eller mot en separat testmiljö.
5. Skapa första Auth-användaren och kör bootstraptransaktionen.
6. Sätt de tre publika deployment-variablerna och bygg `supabase-config.js`.
7. Testa medlem, admin och utomstående i riktiga sessioner på minst två enheter.
8. Importera privata födelsedagar och därefter respektive användares lokala händelser.
9. Publicera först efter antal- och behörighetskontroll.

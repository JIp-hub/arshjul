# Supabase och publicering för V1

V1 använder Supabase för autentisering och gemensamma privata familjedata. Projektet finns, de tre versionshanterade migrationerna är körda och RLS är aktivt. Den här filen beskriver den nuvarande lösningen och den kontrollerade releaseprocessen.

## Klientkonfiguration

Webbläsaren behöver exakt tre publika värden:

| GitHub repository variable | Innehåll | Hemlig? |
|---|---|---|
| `ARSHJUL_SUPABASE_URL` | Projektets HTTPS-URL | Nej |
| `ARSHJUL_SUPABASE_PUBLISHABLE_KEY` | Aktiv modern `sb_publishable_...`-nyckel | Nej |
| `ARSHJUL_AUTH_REDIRECT_URL` | `https://jip-hub.github.io/arshjul/` | Nej |

GitHub Actions bygger `supabase-config.js` i publiceringspaketet. Den incheckade filen förblir tom, så projektvärden blandas inte in i källhistoriken. `scripts/build-supabase-config.mjs` stoppar bygget om ett värde saknas eller om en service role/secret-nyckel upptäcks.

Publishable key och projekt-URL är avsedda för webbläsaren. De ger ingen egen behörighet; all dataåtkomst måste fortfarande passera Auth och RLS. Service role, `sb_secret_...`, databaslösenord och privata JWT:er får aldrig läggas i GitHub-variablerna eller webbappen.

## Auth

Appen använder Magic Link genom `signInWithOtp` med `shouldCreateUser: false`. En adress kan därför inte registrera sig själv. Kontot skapas först manuellt i Supabase Auth och läggs sedan till i `family_members` med betrodd administratörsåtkomst.

Före publicering ska Supabase Auth ha:

- Site URL `https://jip-hub.github.io/arshjul/`,
- samma exakta adress i Redirect URLs,
- e-postinloggning aktiverad och automatisk signup avstängd,
- en kontrollerad Magic Link-mall och fungerande e-postleverans.

Lokal testadress läggs till separat som tillåten redirect och tas bort när den inte längre behövs.

## Databas och RLS

Migrationerna i `supabase/migrations/` skapar:

- `families`,
- `family_members`,
- `events`,
- `birthdays`,
- privata hjälpfunktioner för medlems- och adminkontroll,
- index, datumkontroller, begränsade grants och RLS-policyer.

Behörigheterna är:

- anonym användare har inga tabellrättigheter,
- medlem läser sin familj, medlemsnamn, händelser och födelsedagar,
- medlem skapar händelser med sin egen `auth.uid()` och ändrar/raderar bara egna händelser,
- admin ändrar/raderar alla familjens händelser och administrerar födelsedagar,
- autentiserad användare utan medlemskap ser ingen familjedata,
- `invite_code` ingår inte i någon behörighetspolicy.

V1 visar det äldsta medlemskapet som aktiv familj. Databasen tillåter flera medlemskap, men familjeväljare ligger efter V1.

## Första admin och fler medlemmar

Första admin skapades med den manuella bootstrap som finns beskriven i `supabase/bootstrap/README.md`. För en ny miljö:

1. skapa Auth-kontot manuellt,
2. kopiera `first_admin.example.sql` till den ignorerade `first_admin.local.sql`,
3. fyll den lokala filen med e-post och visningsnamn,
4. kör transaktionen i SQL Editor,
5. verifiera exakt en familj och ett adminmedlemskap,
6. radera den lokala arbetsfilen när verifieringen är klar.

Övriga V1-konton skapas manuellt i Auth och läggs till manuellt i `family_members`. Ett automatiskt inbjudningssystem byggs senare.

## Migrering av privat data

Verklig data importeras först efter att den publicerade tomma V1-versionen klarat Auth- och RLS-test.

- Admin importerar födelsedagar med den befintliga JSON-importen. Importen är additiv, validerar verkliga kalenderdatum, hoppar över dubbletter och tömmer aldrig registret vid fel.
- Varje medlem importerar bara lokala händelser som personen själv ska äga. Adaptern sätter `family_id` och `created_by` från den inloggade sessionen. Den lokala kopian behålls som rollback tills resultatet verifierats.

Privata JSON-filer förvaras utanför repot. `backups/`, `exports/`, `private-data/` och vanliga export-/backupnamn i repo-roten ignoreras av Git.

## GitHub Pages

`.github/workflows/pages.yml` skapar ett minimalt publiceringspaket med endast:

- `index.html`,
- `js/supabase-adapter.js`,
- genererad `supabase-config.js`,
- `.nojekyll`.

Historiska dokument, SQL, tester, utvecklingskopior och lokala filer publiceras inte. Workflowen avbryter före deploy om någon konfigurationsvariabel saknas eller innehåller en otillåten nyckel.

### Obligatorisk historiksanering före V1

Releasegranskningen hittade verkliga familjeuppgifter i äldre HTML-filer och Git-revisioner. Den gamla filen är borttagen ur V1-trädet, men en vanlig merge eller push tar inte bort innehåll ur Git-historik, gamla branches, pull requests eller GitHub-cache.

Före V1-publicering ska därför den befintliga Pages-sidan först avpubliceras och den publika Git-historiken saneras enligt GitHubs process för känsliga data. Bevara vid behov en privat offline-arkivkopia, sanera samtliga berörda filvägar och refs i en separat spegelklon, kontrollera resultatet, uppdatera GitHub med den sanerade historiken och kontakta GitHub Support om cachade revisioner eller pull request-referenser återstår. Gamla kloner får inte senare mergeas tillbaka eftersom det kan återinföra den sanerade historiken.

Efter genomförd och verifierad historiksanering:

1. lägg in de tre publika repository variables,
2. välj **GitHub Actions** som Pages-källa i stället för legacy `main`/root,
3. fast-forward-merga den godkända releasegrenen till lokal `main`,
4. pusha `main` först efter uttryckligt publiceringsbeslut,
5. kontrollera Actions-jobbet och testa den publicerade adressen utloggad samt med befintliga testbehörigheter,
6. importera verklig data först när den tomma produktionsversionen är verifierad.

## Driftkontroller

Efter schema- eller policyändring körs RLS-testet och Supabase security/performance advisors igen. Den nuvarande Auth-varningen om läckta lösenord är inte blockerande för Magic Link-only V1, eftersom appen inte använder lösenordsinloggning. Om lösenord aktiveras senare ska skyddet slås på innan den funktionen publiceras.

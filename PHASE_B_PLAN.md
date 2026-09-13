# Fas B – gemensamma privata familjedata

Detta är genomförandeplanen för nästa fas. Den beskriver Supabase-lösningen men skapar eller ändrar inga externa resurser.

Den lokala förberedelsen B1 finns nu på feature-branchen. Se `SUPABASE_SETUP.md` för aktivering, bootstrap, migrering och återstående B2-steg. Inga externa resurser aktiveras av B1-konfigurationen.

## Minsta V1

1. Skapa ett Supabase-projekt och konfigurera Magic Link med GitHub Pages-adressen som tillåten redirect.
2. Lägg databasschemat och samtliga RLS-policyer i en versionshanterad SQL-migration.
3. Skapa den första familjen och dess första administratör manuellt. Skapa övriga Auth-konton och lägg till dem manuellt i `family_members`; därefter kan de logga in med Magic Link. Ett automatiserat inbjudningsflöde väntar.
4. Implementera en Supabase-baserad variant bakom den befintliga DataStore-gränsen. Nuvarande vyer ska fortsätta anropa samma list-, create-, update- och delete-metoder.
5. Flytta både händelser och födelsedagar till den gemensamma databasen. Privat källdata används bara vid en kontrollerad engångsmigrering och läggs aldrig i repot.
6. Hämta data vid sidöppning samt efter lyckade ändringar. Realtime väntar.
7. Visa inloggnings-, laddnings-, tom- och fellägen i appen. Ta bort familjekodens nuvarande roll som lokal dataskiljare när migreringen är verifierad.

## Minimalt databasschema

### `families`

- `id uuid primary key default gen_random_uuid()`
- `name text not null`
- `invite_code text unique null`
- `created_at timestamptz not null default now()`

`invite_code` får användas för att hitta eller bjuda in till en familj, men ger aldrig i sig läs- eller skrivrättigheter.

### `family_members`

- `family_id uuid references families(id) on delete cascade`
- `user_id uuid references auth.users(id) on delete cascade`
- `display_name text not null`
- `role text not null check (role in ('member', 'admin'))`
- `created_at timestamptz not null default now()`
- `primary key (family_id, user_id)`
- `unique (user_id)` i första V1, som medvetet begränsar varje användare till en familj

Medlemsraden, tillsammans med den inloggade användarens `auth.uid()`, är säkerhetsgränsen.

### `events`

- `id uuid primary key default gen_random_uuid()`
- `family_id uuid not null references families(id) on delete cascade`
- `created_by uuid not null references auth.users(id)`
- `title text not null`
- `event_date date not null`
- `event_time time null`
- `place text null`
- `description text null`
- `icon text not null default '🗓️' check (icon in ('🗓️', '🎉'))`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

Index: `(family_id, event_date)` och `(family_id, created_by)`.

### `birthdays`

- `id uuid primary key default gen_random_uuid()`
- `family_id uuid not null references families(id) on delete cascade`
- `name text not null`
- `birth_year smallint null check (birth_year between 1 and 9999)`
- `birth_month smallint not null check (birth_month between 1 and 12)`
- `birth_day smallint not null check (birth_day between 1 and 31)`
- `created_at timestamptz not null default now()`
- `updated_at timestamptz not null default now()`

En databasfunktion/check ska dessutom verifiera att månad och dag bildar ett verkligt återkommande datum. Årslösa 29 februari ska tillåtas. Index: `(family_id, birth_month, birth_day)`.

## Minsta RLS-modell

RLS aktiveras på alla fyra publika tabeller. Klientappen använder endast Supabase publishable/anon key; service role får aldrig finnas i webbläsaren.

- `families`: en inloggad användare får läsa familjer där en matchande rad finns i `family_members`. Endast administratör får uppdatera familjens namn eller inbjudningskod.
- `family_members`: medlem får läsa medlemslistan och visningsnamnen för sin familj. Medlemskap, visningsnamn och roller ändras manuellt med betrodd server-/dashboardbehörighet i första V1.
- `events` select: tillåts när `family_members` innehåller `(events.family_id, auth.uid())`.
- `events` insert: samma medlemskontroll och krav på `created_by = auth.uid()`.
- `events` update/delete: tillåts när användaren är `created_by`, eller har rollen `admin` i samma familj. `family_id` och `created_by` ska inte kunna bytas av vanlig användare.
- `birthdays` select: tillåts för medlem i samma familj.
- `birthdays` insert/update/delete: tillåts endast för `admin` i samma familj.

Policyerna bör använda en liten `security definer`-hjälpfunktion för medlems- och adminfrågor, med låst `search_path`, så att policyerna inte behöver läsa `family_members` rekursivt. Hjälpfunktionen returnerar endast medlemskap/roll och ska inte exponera privat data.

## DataStore och migrering

Den befintliga DataStore-gränsen behålls. B1 har infört asynkrona Supabase-implementationer för `eventStore` och `birthdayStore`, medan vyerna fortsätter få samma normaliserade objekt som i fas A. Utan Supabase-konfiguration används fortfarande den lokala implementationen.

Migreringen görs i denna ordning:

1. Exportera lokal händelse- och födelsedagsdata från den betrodda enhet som har den slutliga familjedatan.
2. Validera exporten lokalt med samma kalenderregler som i fas A.
3. Skapa familj och medlemskap.
4. Låt varje användare importera de lokala händelser som personen själv ska äga; adaptern sätter rätt `family_id` och `created_by = auth.uid()`.
5. Jämför antal och stickprov innan appen byter DataStore-implementation.
6. Behåll lokal data orörd som rollback-kopia tills den gemensamma versionen är verifierad på minst två enheter.

## Acceptanskriterier

- Magic Link ger en giltig session efter redirect tillbaka till GitHub Pages.
- Två familjemedlemmar ser samma födelsedagar och händelser efter omladdning.
- En medlem kan skapa och ändra sina egna händelser men inte någon annans.
- En administratör kan ändra alla händelser och födelsedagar.
- En användare utan medlemskap kan inte läsa eller ändra familjens data, även om familjekoden är känd.
- Appen hämtar vid start och på nytt efter varje ändring; ingen Realtime-prenumeration krävs.
- Inga privata namn, e-postadresser, nycklar med utökad behörighet eller familjeexporter finns i Git.

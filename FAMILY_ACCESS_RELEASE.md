# Familjeåtkomst: förslag för godkännande

## Kontrollerad nulägesbild (endast läsning)

- En familj, två medlemmar varav en administratör, 22 födelsedagar.
- Familjen har redan en delningskod. Koden ger inte läsbehörighet till familjedata.
- RLS skyddar familjer, medlemskap, händelser och födelsedagar. Endast befintliga familjemedlemmar kan läsa familjedata; klienter kan inte själva skriva medlemskap.
- Inga Edge Functions eller Supabase-utvecklingsgrenar fanns vid granskningen.
- Den publicerade GitHub Pages-arbetsgången körs bara vid push till `main` eller manuellt startad körning. Denna arbetsgren påverkar därför inte sidan.
- Projektets Auth-inställningar för stängd registrering och SMTP beskrivs av beställaren; tillgängliga läsverktyg exponerar inte live-inställningarna. De måste kontrolleras vid release.

## Beslutad design

1. Administratören kopierar en vanlig länk i appen och delar den i Messenger. Länken innehåller familjens befintliga delningskod.
2. Släktingen anger namn och egen e-postadress. En publik Edge Function tar emot ansökan och skriver den med servernyckel. Formuläret kan inte läsa ansökningar eller familjedata.
3. Enbart administratören ser ansökningarna genom RLS och kan godkänna eller avslå i appen.
4. Vid godkännande verifierar Edge Function administratörens session och familjeroll, skapar eller återanvänder Auth-användaren, skriver ett vanligt medlemskap och skickar en engångslänk via befintlig Auth-e-post. Öppen Auth-registrering förblir avstängd.
5. RLS kräver både medlemskap, bekräftad e-post och tidigare inloggning innan familjedata kan läsas. Länken i Messenger ger aldrig dataåtkomst.

Med stängd öppen registrering avvisar Supabase Auth engångskod till ett nytt, ännu obekräftat konto. Servern skapar därför ett godkänt konto utan lösenord med Auths e-postflagga satt, men RLS öppnar ingen familjedata förrän kontot faktiskt har loggat in med koden som skickas till adressen. Den första kodinloggningen bevisar kontroll över e-postadressen. Ett redan existerande, obekräftat Auth-konto kan kräva separat utredning och ska inte markeras bekräftat automatiskt.

Safari och en iPhone-app från hemskärmen har separata sessionslager. En inloggningslänk som öppnas i Safari loggar därför inte automatiskt in hemskärmsappen. Samma Auth-mejl innehåller en engångskod som skrivs direkt i hemskärmsappen. Därefter lagras och återställs sessionen i den appens eget lager.

Ansökningar är unika per familj och e-postadress. Servern begränsar försök per IP-hash och per familj, och formuläret har ett dolt botfält. Ett målmedvetet angrepp mot en offentlig länk kan fortfarande kräva CAPTCHA eller att delningskoden byts; någon sådan extern tjänst behövs inte för första familjelanseringen.

Godkännande sker i separata Auth-, databas- och e-postanrop. En enda transaktion över dessa system är inte möjlig. Flödet låser ansökan villkorligt, återanvänder redan skapad Auth-användare och medlemskap vid återförsök samt visar ett tydligt återförsöksläge. Ett avbrott precis efter e-postleverans kan medföra en extra engångslänk vid återförsök; endast den senaste bör användas. Ingen service role-nyckel finns i frontend eller versionshistoriken.

## Verifierat i kostnadsfri lokal testmiljö

- Supabase CLI 3.4 med experimentell native stack på Apple Silicon startar lokalt utan Docker eller betald Supabase-gren. PostgreSQL, Auth, Edge Functions och Mailpit körs endast mot `127.0.0.1`. Inga riktiga uppgifter eller utgående mejl används.
- `supabase test db`: 28 pgTAP-kontroller passerar, inklusive RLS och avskilda ansökningar.
- `node tests/local-integration.mjs`: stängd registrering, syntetisk admin, ansökan och dubblett, otillåten läsning/beslut, godkännande, Mailpit-kod, separat installerad session, återställning efter omstart, familjedata först efter kodinloggning, avslag och idempotent godkännande passerar.
- `node --test tests/family-access-workflow.test.mjs`: 6 arbetsflödestester passerar, inklusive fel och återförsök.
- `node tests/local-mobile-browser.mjs`: Chrome på 390 px mobilbredd visar ingen horisontell rullning; instruktioner, manifest och alla ikoner levereras. Simulerat fristående appläge visar rätt inloggningshjälp och skickar kodinmatningen till Auth. Detta är en webbläsarkontroll, inte en iPhone-simulator.
- Integrationen upptäckte och rättade två fel: tjänsterollen saknade uttryckliga tabellrättigheter i den striktare lokala konfigurationen, och ett obekräftat Auth-konto kunde inte få OTP när öppen registrering är avstängd.

Den lokala native stacken är experimentell. Testerna behöver CLI 3.4 och tillfälligt installerade Node-bibliotek; de innehåller inga verkliga familjeuppgifter. CLI-utskrift från `stack status` innehåller lokala nycklar och ska aldrig sparas i loggar eller GitHub.

## Acceptans före familjelansering

1. **iPhone, installerad app:** Öppna länken i Safari, lägg till Årshjulet på hemskärmen och öppna ikonen. Begär mejl i appen, öppna mejlet i Mail/Safari och skriv koden i hemskärmsappen. Kontrollera att privat data syns, stäng appen helt och öppna igen; sessionen och datan ska finnas kvar. Kontrollera även att en länk som öppnats i Safari inte felaktigt utlovas som inloggning i hemskärmsappen.
2. **iPhone-layout:** Kontrollera på en fysisk iPhone med Dynamic Island att rubrik, inloggningsfält, årshjul, dialogrutor och knappar inte ligger under statusfältet, ön eller hemindikatorn; kontrollera både stående läge och öppet tangentbord.
3. **Android:** Installera från Chrome, kontrollera ikon och fristående läge, logga in med kod, stäng och öppna igen.
4. **Familjesäkerhet:** Bekräfta i isolerad miljö med syntetiska adresser att anonym/sökande/vanlig medlem inte kan läsa ansökningskön eller bevilja sig själv åtkomst, att avslagen ansökan inte får data och att godkänd men ännu inte kodinloggad person inte får familjedata.
5. **Produktionsförberedelse:** Läs av faktiska Auth-inställningar, tillåten GitHub Pages-redirect och e-postmall. Publicera e-postmallen med `{{ .Token }}` tillsammans med kodflödet; utan den kan en installerad iPhone-app inte använda kodinloggningen. Verifiera sedan ett syntetiskt sluttest på publicerad version före delning av familjelänken.

Det fysiska iPhone-testet bekräftade installation, kodinloggning, bibehållen session och syntetiska födelsedagar efter återöppning. Layouten felade vid formuläröppning och direkt efter inloggning: den tidigare fastklistrade rubriken täckte instruktioner, och kvarvarande rullning placerade navigeringen bakom statusfältet. Arbetsgrenen håller nu rubriken i normalt sidflöde, behåller säker toppmarginal och återställer rullningen efter kodinloggning samt när en inloggad hemskärmsapp återupptas med navigation i statusområdet. Ett senare fysiskt omprov visade åter rubriken under navigationen trots att denna ordning inte kan uppstå med den nya DOM- och CSS-positioneringen. Den lokala testservern skickar `Cache-Control: no-store`, men iOS kan ändå återuppta en redan laddad app utan ny nätbegäran. En testetikett, `TEST 26/11 D`, saknades på iPhone även efter att den gamla appen stängts helt; HTTPS-serverns anonyma sidräknare registrerade ingen ny hämtning. Alla tre syntetiska konton i rätt teststack har medlemskap, så meddelandet om väntande familjeåtkomst tyder också på att fel appadress eller en äldre session används. En andra, tydligt namngiven lokal testinstallation med unik manifestidentitet och startadress `/?test-build=D` har förberetts på samma certifikat och testdata. Lokalt mobiltest passerar; fysisk kontroll av den nya ikonen återstår. Android är ännu inte slutverifierat. Inga produktionsändringar eller publiceringar har gjorts.

## Efter uttryckligt godkännande

1. Genomför iPhone- och Android-kontrollerna ovan mot en isolerad testmiljö eller lokalt nät med syntetiska uppgifter.
2. Kontrollera live Auth-inställningar skrivskyddat: öppen registrering av, fungerande SMTP, tillåten redirect och aktuell e-postmall.
3. Efter separat godkännande för live-ändringar: applicera migrationen, distribuera funktionen, uppdatera Auth-mejlmallen med kod, slå samman arbetsgrenen med `main` och gör ett syntetiskt sluttest före delning i Messenger.

Rollback för webbgränssnittet är återgång av GitHub Pages-commit. Databasmigrationen är additiv; den lämnar befintliga familjedata orörda. Ta bort funktionen eller stoppa den publika länken vid ett problem. Återställ inte medlemskap eller födelsedagar som del av rollback.

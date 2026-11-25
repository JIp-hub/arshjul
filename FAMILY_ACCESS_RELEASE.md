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

Ansökningar är unika per familj och e-postadress. Servern begränsar försök per IP-hash och per familj, och formuläret har ett dolt botfält. Ett målmedvetet angrepp mot en offentlig länk kan fortfarande kräva CAPTCHA eller att delningskoden byts; någon sådan extern tjänst behövs inte för första familjelanseringen.

Godkännande sker i separata Auth-, databas- och e-postanrop. En enda transaktion över dessa system är inte möjlig. Flödet låser ansökan villkorligt, återanvänder redan skapad Auth-användare och medlemskap vid återförsök samt visar ett tydligt återförsöksläge. Ett avbrott precis efter e-postleverans kan medföra en extra engångslänk vid återförsök; endast den senaste bör användas. Ingen service role-nyckel finns i frontend eller versionshistoriken.

## Tester och kvarvarande releasekontroller

- Lokala syntetiska arbetsflödestester: godkännande, e-postfel/återförsök, samtidigt godkännande, idempotent redan-godkänt.
- JavaScript/TypeScript-syntax och diffkontroll körs lokalt.
- pgTAP-tester för RLS, obehörig ansökningsläsning, självbeviljad åtkomst och overifierat konto är incheckade men kan inte köras här: varken lokal Supabase, Docker eller en kostnadsfri isolerad Supabase-gren är tillgänglig.
- Kör migration och pgTAP i isolerad testmiljö med syntetiska adresser innan live-release. Testa också Magic Link med stängd registrering och SMTP i den miljön. Lägg aldrig riktiga adresser i testloggar.

## Efter uttryckligt godkännande

1. Skapa eller välj isolerad Supabase-testmiljö utan produktionsdata; bekräfta eventuell kostnad innan en betald Supabase-gren skapas.
2. Kör migrationen, RLS-testerna och Edge Function i testmiljön. Kontrollera de fyra rollerna (anonym, sökande, medlem, admin), dubbletter, avslag, e-postfel och återförsök.
3. Kontrollera live Auth-inställningarna: öppen registrering av, fungerande SMTP och tillåten redirect till GitHub Pages.
4. Efter separat godkännande för live-ändringar: kör migrationen, distribuera funktionen och slå samman arbetsgrenen med `main`. Gör ett syntetiskt sluttest utan verkliga familjeadresser och dela sedan länken i Messenger.

Rollback för webbgränssnittet är återgång av GitHub Pages-commit. Databasmigrationen är additiv; den lämnar befintliga familjedata orörda. Ta bort funktionen eller stoppa den publika länken vid ett problem. Återställ inte medlemskap eller födelsedagar som del av rollback.

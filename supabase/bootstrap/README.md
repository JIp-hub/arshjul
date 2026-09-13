# Bootstrap av första familjen och första admin

Bootstrap sker med betrodd databasbehörighet och exponeras inte som en RPC-funktion i klienten.

1. Konfigurera projektets Site URL och tillåtna redirect-URL för GitHub Pages.
2. Skapa den första användaren manuellt under **Authentication → Users**. Kontot måste finnas innan medlemskapet skapas. B1 skickar inga mejl.
3. Kopiera `first_admin.example.sql` till `first_admin.local.sql`. Den lokala filen ignoreras av Git.
4. Ersätt e-post- och visningsnamnsplatshållarna i den lokala kopian.
5. Kör hela transaktionen en gång i Supabase SQL Editor.
6. Kontrollera att exakt en rad skapades i `families` och en rad med `role = 'admin'` i `family_members`.
7. Radera den lokala SQL-kopian när bootstrap och kontrollen är klara.

Skriptet avbryter om platshållare finns kvar, om familjen redan har skapats eller om e-postadressen inte motsvarar exakt en befintlig Auth-användare. Familjens slumpade kod identifierar familjen men används inte av någon RLS-policy.

Efter bootstrap loggar administratören in via appens Magic Link-formulär. Formuläret använder `shouldCreateUser: false`, så okända e-postadresser skapar inte automatiskt konton. Övriga V1-medlemmar skapas manuellt i Auth och läggs manuellt till i `family_members` med rollen `member`.

# V1 regressionschecklista – Årshjulet

Använd endast syntetisk data. Kontrollera att all tillfällig testdata är borta när testet är klart.

## Auth och åtkomst

- [ ] Utloggad användare ser Magic Link-formuläret och ingen familjedata.
- [ ] Magic Link återvänder till rätt adress och ger en session.
- [ ] Medlem ser sin familjs data och kan skapa, redigera och radera egna händelser.
- [ ] Medlem kan inte ändra andras händelser eller administrera födelsedagar.
- [ ] Admin kan hantera alla familjens händelser och födelsedagar.
- [ ] Autentiserad användare utan medlemskap ser ingen familjedata.
- [ ] Utloggning tömmer vyerna och minnescachen.

## Vyer och datum

- [ ] Hjul, lista och översikt visar samma data.
- [ ] Alla tolv sektorer kan väljas med mus, touch och tangentbord.
- [ ] Januari ligger mellan 12 och 1; december ligger mellan 11 och 12.
- [ ] Aktuell och vald månad har skilda, tydliga markeringar.
- [ ] Indikatorerna skiljer födelsedagar från händelser utan ensamma oförklarade siffror.
- [ ] Månadspanelen uppdateras direkt för tom månad, bara födelsedag, bara händelse och båda.
- [ ] Årsbyte filtrerar daterade händelser; födelsedagar återkommer och ålder uppdateras.

## Dataflöden

- [ ] Skapa, redigera och radera uppdaterar alla aktiva vyer.
- [ ] Ogiltiga kalenderdatum och felaktig JSON avvisas utan dataförlust.
- [ ] Händelse- och födelsedagsimport är additiv och dubblettsäkert.
- [ ] Export innehåller förväntad data och ingen data från annan familj.
- [ ] Kopiering innehåller endast födelsedagar.
- [ ] Utskrift innehåller endast födelsedagar och fungerar både från knappen och webbläsarmenyn.

## Tillgänglighet och layout

- [ ] Desktop 1280 × 900 och mobil 375 × 667 är läsbara utan blockerande överlappning.
- [ ] Dialoger har dialogsemantik, maxhöjd och intern rullning på mobil.
- [ ] Tab och Shift+Tab hålls i öppen dialog; Escape stänger en dialog i taget.
- [ ] Fokus återgår till kontrollen som öppnade dialogen.
- [ ] Månadspanelen förs in i synligt område på mobil utan att tangentbordsfokus flyttas.

## Fel och release

- [ ] Nätverks-, Supabase-, lagrings- och kopieringsfel visas begripligt och låser inte appen permanent.
- [ ] Konsolen har inga oväntade JavaScript-fel.
- [ ] `index.html` är publiceringsfilen och ingen experimentvy är aktiverad.
- [ ] Pages-paketet innehåller endast avsedda webbfiler.
- [ ] Ingen privat data, backup, export, service role- eller secret-nyckel finns i aktuell Git-tree eller publiceringspaketet.
- [ ] RLS är aktivt på alla fyra tabeller och policytestet går igenom.

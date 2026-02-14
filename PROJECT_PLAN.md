PROJECT PLAN – Årshjul
# PROJECT PLAN – Årshjul

## Arbetssätt som alltid gäller (mellan chattar)

### 1) Kodändringar – exakt arbetsflöde (obligatoriskt)
När vi gör ändringar i `index-dev.html` ska ChatGPT alltid leverera ändringar så här:

A. **Visa befintlig kod** (exakt som den ser ut just nu i filen)  
- Visa hela blocket som ska ändras, inte bara enstaka rader.
- Blocket ska vara tillräckligt stort för att jag tydligt ska hitta det i filen.

B. **Visa vad som ska ersättas**  
- Skriv tydligt: “Ersätt hela detta block: …”
- Ange hur jag hittar blocket (t.ex. “sök efter `@media print`” eller “sök efter `id="toggleOverviewBtn"`).

C. **Visa ny kod (ersättningsblocket)**  
- Ge ett komplett nytt block som jag kan kopiera och ersätta med, utan att behöva pussla.

D. **Ge hela nya blocket i ett sammanhängande kodblock**  
- Allt jag ska klistra in ska komma i ett enda sammanhängande block.

E. **Stegvis**  
- Vi gör en ändring i taget.
- Efter varje steg väntar ChatGPT på min bekräftelse (“klart”) innan nästa steg.

### 2) Modellval (Thinking vs snabb)
- **Snabb modell:** små, enkla ändringar, textjusteringar, tydliga fel som är lätta att lokalisera.
- **Thinking:** när vi felsöker beteenden (t.ex. print-layout), gör större omstrukturering, eller när flera delar påverkas samtidigt.
- Om valet är oklart: börja i snabb modell och byt till Thinking om vi behöver djup felsökning.

### 3) Avslutsrutin innan byte av chatt (obligatoriskt)
Innan vi lämnar en chatt ska ChatGPT alltid avsluta med:

1. **Status:** var vi är i planen (kort och konkret)  
2. **Gjort:** vad som är klart (punktlista)  
3. **Nästa steg:** exakt vad vi ska göra härnäst (punktlista)  
4. **PROJECT_PLAN.md:** påminnelse om att uppdatera planen vid behov  
5. **Startprompt för ny chatt:** en kort text jag kan klistra in i ny chatt

### 4) Grundregel
Eftersom chattar kan bli långa eller bytas måste metoden och beslut dokumenteras i projektets filer.  
`PROJECT_PLAN.md` är källan för arbetssätt, beslut och “vad som gäller” när vi fortsätter i en ny chatt.

---

## Status
Projektet är i fas 1: Stabil HTML-version med overlay, åldersberäkning och printläge.

## Vision
Årshjulet ska bli:
- En responsiv webbapp
- Installationsbar som PWA
- Fungerande på iPhone, Samsung och desktop
- Kunna användas av fler än familjen Kjellberg
- Gratis i version 1
- Möjlig att vidareutveckla kommersiellt

## Fasindelning

### FAS 1 – Stabil grund (nuvarande fas)
- HTML + CSS + JS i en fil
- Overlay fungerar
- Åldersberäkning fungerar
- Print fungerar stabilt
- Mobilvy är läsbar  
Mål: Stabil fungerande produkt utan backend.
- **Printstrategi (Safari-stabil):** Print bygger en separat ren text-vy i `#printMeta` + `#printWrap` via `beforeprint` och döljer `#months` i print. Två kolumner: Jan–Jun vänster, Jul–Dec höger. Visar “År: …”.


### FAS 2 – Struktur & förberedelse för andra användare
- Separera JS i egen fil
- Separera CSS i egen fil
- Strukturera data så att familjedata inte är hårdkodad
- Förbered för flera “årshjul-profiler”  
Mål: Göra projektet generiskt.

### FAS 3 – Webbadress
- Publicera via GitHub Pages
- Säkerställa mobilåtkomst via länk
- Testa iPhone + Samsung

### FAS 4 – PWA
- manifest.json
- service worker
- offline-stöd
- installationsbar ikon

### FAS 5 – Möjlig kommersiell version
- Flera användarprofiler
- Enkel datalagring
- Eventuell backend (valfritt)

## Nuvarande position
Vi befinner oss i FAS 1.  
Nästa steg: Säkerställa mobil + print stabilitet innan strukturändring.

---

## Startprompt för ny chatt (kopiera vid chattbyte)
Vi fortsätter projektet Årshjul. Följ PROJECT_PLAN.md i repo-mappen. Arbeta enligt “Kodändringar – exakt arbetsflöde” (visa befintligt block → säg vad som ersätts → ge nytt block → ge hela blocket som ska klistras in, stegvis och vänta på “klart” mellan stegen). Just nu fokuserar vi på printlayout (kolumner, inga “tomma månader”, och tydligt vilket år som skrivs ut) och översiktsvyn.

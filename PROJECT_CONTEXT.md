# PROJECT CONTEXT – Tlumacz AnimeGate

## 1) Stan projektu
- Data aktualizacji: 2026-03-11.
- Repozytorium Git: aktywne, branch `main`, zdalne `origin` (GitHub).
- Aktualna wersja aplikacji (`package.json`): `1.0.23`.
- Ostatnie commity:
  - `f9ea76b` – Krok 0 foundation (projekt dyskowy + minimalny UI)
  - `13a9405` – auto-update IPC + preload + minimalny UI statusu
  - `48ca83b` – workflow release + bump do `1.0.1`
  - `35138bf` – foundation auto-update (electron-updater + publish config + release:win)
  - `ae545f1` – baseline verify + testy parsera ASS round-trip (Vitest + fixtures)
  - `01ba205` – konfiguracja instalatora NSIS + `build:win`
  - `b129606` – stabilizacja wyboru silnika (stop flicker / auto-switch loop)

## 2) Stack i architektura
- Electron (main/preload) + React + TypeScript + Vite.
- Kluczowe pliki:
  - `src/App.tsx` – glowny renderer i logika aplikacji.
  - `src/hooks/useUpdaterStatus.ts` – hook renderera do subskrypcji statusu updatera i akcji check/download/install.
  - `electron/projectStorage.ts` – trwały storage projektu na dysku (`animegate-project.json`, schema v1).
  - `src/subtitleParser.ts` – parser i zapis ASS/SSA (`tlmode`).
  - `src/anilist.ts` – integracja AniList i merge castu serii.
  - `src/translationStyle.ts` – style, archetypy, profile postaci, kontekst tlumaczenia.
  - `electron/main.ts` – okno Electron, IPC, ffmpeg/waveform.
  - `electron/updater.ts` – runtime updater (main process), check for updates po starcie + event logging.
  - `electron/preload.ts` – `window.electronAPI`.

## 3) Moduly funkcjonalne

### 3.1 Pipeline tlumaczenia
- Tryby: "Tlumacz wszystko", "Tlumacz zaznaczone", Stop.
- Batchowanie, retry, fallback providerow, raport koncowy.
- Zachowanie tagow ASS przez tokenizacje i tlumaczenie segmentow tekstowych.

### 3.2 Parser ASS/SSA i tlmode
- Odczyt/zapis `Dialogue` z zachowaniem timingow, stylow, tagow.
- `tlmode` kompatybilny z Kainote (dual text rozdzielony poprawnie).

### 3.3 Postacie i style (Krok 1/2/3)
- Krok 1: AniList search + baza robocza castu.
- Krok 2: korekta plci.
- Krok 3: global style + per-postac style, archetyp, cechy i opis.
- Naprawione dopasowanie nazw postaci:
  - normalizacja ignoruje nawiasy i dopiski techniczne (`Krai`, `Krai(M)`, `Krai (mysli)` -> jedna baza).
- Naprawione dedupe:
  - Krok 3 renderuje finalna, zdeduplikowana liste postaci (source of truth po merge).

### 3.4 AniList i prefill profilu
- Pobierane dane: nazwa, rola, plec, obraz, description.
- Generowane pola:
  - `descriptionShort`, `personalityTraits`.
  - inferencje: `inferredArchetype`, `inferredStyle`, `inferredMannerOfAddress`, `inferredPolitenessLevel`, `inferredVocabularyType`, `inferredTemperament`.
- Prefill w Kroku 3 uzupelnia puste pola (nie nadpisuje recznych wartosci).

### 3.5 Kontekst tlumaczenia
- `buildTranslationStyleContext()` wykorzystuje:
  - global style,
  - style per-postac,
  - archetyp,
  - plec,
  - cechy mowienia,
  - notatke postaci,
  - poziom grzecznosci/temperament/slownictwo,
  - skrot opisu AniList.

### 3.6 Wybor silnika (engine selector)
- Dropdown jest kontrolowany przez jedno zrodlo prawdy (`selectedModelId`).
- Naprawiona petla auto-resetu:
  - hydracja projektu uruchamiana tylko przy realnym switchu projektu,
  - fallback modelu tylko gdy aktualna wartosc jest niepoprawna,
  - brak nadpisywania recznego wyboru przy zwyklym rerenderze.

### 3.7 Wideo, waveform, auto-timing
- HTML5 player + synchronizacja z tabela dialogow.
- Waveform przez IPC (`video:getWaveform`) + cache.
- Auto-snap timingu (start/end/linia/zaznaczone/wszystko).

### 3.8 ffmpeg bundled
- Bundled-first, fallback do PATH.
- `ffmpeg` pakowany przez `extraResources` do builda.

### 3.9 Projekty serii
- "Nowy projekt" / "Wczytaj projekt".
- Persist metadanych projektu i ustawien stylow per projekt.
- Klucze per-projekt dla configu wideo i cache obrazkow.

## 4) Providery i API
- Skonfigurowane providery: libre, mymemory, deepl, openai, openrouter, groq, together, mistral, claude, gemini, cohere, google, azure, papago, yandex.
- Czesciowo placeholdery dla providerow niepodlaczonych w request layer.
- API config: localStorage + trwały zapis przez IPC.

## 5) Build i dystrybucja
- Skrypty:
  - `npm run build`
  - `npm run build:renderer`
  - `npm run build:electron`
  - `npm run build:win`
  - `npm run release:win` (full build + publish artifacts do GitHub Releases)
- Konfiguracja `electron-builder` (w `package.json`):
  - `appId`: `com.animegate.translator`
  - `productName`: `AnimeGate Translator`
  - target: `nsis`
  - `artifactName`: `AnimeGate-Translator-Setup.exe`
  - NSIS: `perMachine=true`, `oneClick=false`, skroty Desktop + Start Menu.
  - publish: `github` (`owner=anikronika-svg`, `repo=T-umacz-AnimeGate`, `releaseType=release`).
- Workflow release:
  - `.github/workflows/release.yml`
  - trigger: push tagu `v*` (np. `v1.0.1`)
  - walidacja: tag musi odpowiadać `package.json.version`
  - publikacja: `npm run release:win` z `GH_TOKEN=${{ secrets.GITHUB_TOKEN }}`
- Wygenerowany instalator:
  - `C:\Users\Adrian\Desktop\Tlumacz AnimeGate\release\AnimeGate-Translator-Setup.exe`

## 6) Status QA
- Potwierdzone technicznie:
  - `tsc --noEmit` przechodzi,
  - build renderer/electron/win przechodzi,
  - instalator tworzy wpis uninstall i skroty,
  - uninstall usuwa wpis i pliki instalacyjne.
  - `npm run verify:baseline` przechodzi (pipeline-hardening-check + series-projects-smoke + archetype-ab-test),
  - `npm run test` (Vitest) przechodzi: testy parsera ASS round-trip.
- Nadal do domkniecia manualnie w UI (regresja/UX):
  - pelny scenariusz E2E krokow postaci na realnym pliku,
  - wizualna walidacja braku duplikatow i prefilla na kartach.

## 7) Znane uwagi
- Build uzywa domyslnej ikony Electron, bo w repo brak dedykowanego `build/icon.ico`.
- W outputach terminala powtarza sie warning o PowerShell profile policy (nie blokuje buildow).
- Uruchomienia Vite/Vitest w tym srodowisku codex wymagaja czasem eskalacji (spawn `EPERM` w sandboxie); poza sandboxem przechodza poprawnie.

## 8) Zmiany wykonane w tym cyklu (Refaktor v1 – Etap 0 i 2)
- Dodano baseline verify pipeline:
  - nowe skrypty npm: `verify:baseline`, `verify`.
- Dodano konfiguracje testow Vitest:
  - `vitest.config.ts`,
  - skrypty npm: `test`, `test:watch`,
  - dependency dev: `vitest`.
- Dodano fixtures ASS:
  - `src/test/fixtures/ass/basic.ass`
  - `src/test/fixtures/ass/tags.ass`
  - `src/test/fixtures/ass/newline.ass`
  - `src/test/fixtures/ass/tlmode.ass`
- Dodano testy parsera:
  - `src/subtitleParser.spec.ts` z round-trip `parse -> serialize -> parse`,
  - walidacje zachowania tagow ASS, `\N`, braku utraty `sourceRaw`, semantyki `tlmode`.

## 9) Auto-update (analiza stanu przed wdrozeniem)
- Etap foundation (bez zmiany runtime/UI) został wdrozony:
  - dodano dependency `electron-updater`,
  - dodano `build.publish` dla GitHub Releases,
  - dodano skrypt `release:win`.
- Etap runtime (main process, bez UI/IPC) został wdrozony:
  - dodano moduł `electron/updater.ts`,
  - `main.ts` inicjalizuje updater po `app.whenReady()` przez `initializeAutoUpdate()`,
  - updater obsługuje eventy:
    - `checking-for-update`
    - `update-available`
    - `update-not-available`
    - `error`
    - `download-progress`
    - `update-downloaded`
  - check for updates uruchamiany automatycznie po starcie aplikacji (tylko gdy `app.isPackaged=true`),
  - jawny, bezpieczny guard dla dev mode (`disabled-dev` log, brak check).
- Etap IPC + preload + minimalny UI został wdrozony:
  - IPC commandy:
    - `updater:getStatus`
    - `updater:checkForUpdates`
    - `updater:downloadUpdate`
    - `updater:installUpdate`
  - IPC event statusu:
    - `updater:status` (broadcast z main process do rendererów)
  - preload API (`window.electronAPI`):
    - `getUpdaterStatus()`
    - `checkForUpdates()`
    - `downloadUpdate()`
    - `installUpdate()`
    - `onUpdaterStatus(callback) => unsubscribe`
  - renderer:
    - `useUpdaterStatus()` jako cienka warstwa konsumpcji statusu i akcji,
    - minimalny pasek statusu w `App.tsx` z przyciskami `Sprawdz`, `Pobierz`, `Instaluj`.
  - kontrakt statusu:
    - fazy: `idle`, `checking-for-update`, `update-available`, `update-not-available`, `download-started`, `download-progress`, `update-downloaded`, `installing`, `error`.
  - main process pozostaje źródłem prawdy dla update flow.
- Nadal do domkniecia:
  - finalny test E2E aktualizacji miedzy realnymi release (np. `1.0.1` -> `1.0.2`) na maszynie docelowej.

## 10) Wersjonowanie i release policy
- Każda większa zmiana funkcjonalna:
  1) bump wersji (`npm version <new> --no-git-tag-version`)
  2) commit + push
  3) tag `vX.Y.Z` + push tagu
  4) GitHub Actions publikuje release assets i `latest.yml`
  5) aktualizacja `PROJECT_CONTEXT.md`

## 11) Zmiany plikowe w etapie IPC/UI updatera
- `electron/updater.ts` – rozszerzony o status store, subskrypcje, commandy updatera.
- `electron/main.ts` – dodany `setupUpdaterIpc()` i broadcast statusów do renderer.
- `electron/preload.ts` – jawne API updatera przez `contextBridge`.
- `src/electron.d.ts` – typy updater API dla renderer.
- `src/hooks/useUpdaterStatus.ts` – nowy hook.
- `src/App.tsx` – lekki pasek statusu aktualizacji + akcje check/download/install.

## 12) Krok 0: Projekt (foundation v1)
- Dodano fundament projektow dyskowych (JSON) przed krokami 1/2/3:
  - nowy plik konfiguracyjny projektu: `animegate-project.json`,
  - wersjonowany schemat: `schemaVersion=1`.
- Dodane IPC dla projektu:
  - `project:pickDirectory`
  - `project:create`
  - `project:open`
  - `project:saveConfig`
- Dodane API preload dla renderera:
  - `pickProjectDirectory()`
  - `createProject()`
  - `openProject()`
  - `saveProjectConfig()`
- Dodany minimalny UI Kroku 0:
  - modal `Krok 0: Projekt` (Nowy projekt / Otworz istniejący),
  - wskazanie aktywnego projektu dyskowego w pasku projektu.
- Dodane zachowanie v1:
  - zapis i odczyt konfiguracji projektu z dysku,
  - automatyczne przywrócenie ostatniego aktywnego projektu przy starcie,
  - autozapis konfiguracji projektu (debounced) po zmianach,
  - wejście do modalu Postacie (Kroki 1-3) wymaga aktywnego projektu dyskowego.
- Zakres celowo ograniczony (bez rewolucji):
  - istniejący flow kroków 1/2/3 nadal działa,
  - integracja pełnej mapy wszystkich danych odcinka i pipeline do projektu będzie domykana etapowo.

## 13) Następny krok (Krok 0 integracja v2)
- Ujednolicić i zapisywać pełny stan kroków 1/2/3 do projektu (w tym pełniejsze mapowanie przypisań linii i metadanych castu).
- Dodać walidację kompatybilności i migracje schematu (`v1 -> v2`) bez łamania istniejących projektów.

## 14) Krok 0: integracja danych Kroków 1/2/3 (v2)
- Dodano jawny mapper stanu projektu:
  - `src/project/projectMapper.ts`
  - kierunki mapowania:
    - `app state -> animegate-project.json`
    - `animegate-project.json -> app state`
- Dane kroków 1/2/3 zapisywane i przywracane przez mapper:
  - wybrane anime (meta AniList: `anilist.id`, tytuł projektu),
  - lista postaci roboczych (char workflow),
  - role (`anilistRole`),
  - płeć (`gender`),
  - ręczne korekty postaci (style, profile, notatki),
  - ustawienia stylu tłumaczenia z Kroku 3 (`globalStyle`, per-postać `style`, profile),
  - przypisania linii do postaci (`lineCharacterAssignments`: `lineId`, `rawCharacter`, `resolvedCharacterName`).
- Character Modal (Kroki 1/2/3) przy otwarciu odtwarza teraz:
  - bazę roboczą postaci po prawej (worker cast) na podstawie zapisanych postaci projektu,
  - meta wybranego anime jeśli projekt ma `anilistId`.
- Zostawiono kompatybilność i brak migracji schematu:
  - nadal `schemaVersion = 1`,
  - bez zmian łamiących istniejące projekty.

## 15) Otwarte braki do pełnego systemu projektów
- Brak pełnej, oddzielnej persystencji tymczasowych wyników wyszukiwania AniList (lista wyników i zaznaczenia z lewego panelu Kroku 1).
- Brak formalnych testów automatycznych E2E GUI dla scenariusza: utwórz projekt -> ustaw kroki 1/2/3 -> restart -> otwórz projekt -> weryfikacja UI.

## 16) Wzmocnienie przypisan linii do postaci (v1.0.4)
- Problem:
  - samo `lineId` bylo zbyt slabe dla pracy miedzy odcinkami i przy ponownym imporcie plikow ASS.
- Decyzja:
  - zachowano kompatybilnosc `schemaVersion=1`,
  - rozszerzono `lineCharacterAssignments` o opcjonalne `lineKey` (stabilny klucz linii),
  - dodano bezpieczny fallback dopasowania po znormalizowanej nazwie surowego mowcy (`rawCharacter`).
- Implementacja:
  - nowy modul `src/project/assignmentMatching.ts`:
    - buduje `lineKey` z: `startMs|endMs|style|normalized sourceRaw`,
    - serializuje przypisania do projektu,
    - odtwarza przypisania przez:
      1) dopasowanie exact po `lineKey`,
      2) fallback aliasowy po `rawCharacter` (zliczanie glosow i wybor najlepszego dopasowania).
  - `src/App.tsx`:
    - zapis przypisan przez mapper (`buildProjectLineAssignments`),
    - odczyt przypisan do stanu projektu,
    - zastosowanie przypisan przy imporcie napisow (`applyProjectLineAssignments`) przed ustawieniem `rows`.
  - aktualizacja typow projektu:
    - `src/project/projectMapper.ts`
    - `electron/projectStorage.ts`
    - `electron/preload.ts`
- Efekt:
  - przypisania linii sa trwale zapisywane i stabilniej odtwarzane po restarcie aplikacji,
  - model jest lepiej przygotowany pod kolejne odcinki bez przebudowy UI.
- Nadal otwarte:
  - brak heurystyki semantycznej (np. fuzzy po tresci dialogu) dla skrajnych przypadkow, gdy timing i styl ulegaja duzym zmianom.

## 17) P0 hotfix: blank screen po auto-update (v1.0.5)
- Objaw:
  - po `download + install update` aplikacja startowala z pustym, ciemnym oknem.
- Ustalenia diagnostyczne:
  - artefakt pakietu (`app.asar`) zawiera poprawnie:
    - `dist/index.html`
    - `dist/assets/*`
    - `dist-electron/main.js`
    - `dist-electron/preload.js`
  - najbardziej prawdopodobny punkt awarii: runtime renderer/preload bez widocznej diagnostyki (cichy crash, brak fallbacku), a nie brak plikow w paczce.
- Wdrozone zabezpieczenia startowe (production diagnostics):
  - `electron/main.ts`:
    - log startupu do pliku (`userData/logs/startup.log`),
    - logowanie: `did-finish-load`, `did-fail-load`, `preload-error`, `render-process-gone`, `console-message` (warn/error),
    - globalne handlery: `uncaughtException`, `unhandledRejection`, `unresponsive`,
    - fallback: diagnostyczny ekran HTML (data URL) przy krytycznym bledzie ladowania.
  - `src/main.tsx`:
    - globalne handlery `window.error` i `window.unhandledrejection`,
    - awaryjny ekran bledu renderera zamiast pustego tla.
  - `src/StartupErrorBoundary.tsx`:
    - boundary dla bledow React render lifecycle.
- Cel hotfixu:
  - nawet przy krytycznej awarii startu user ma czytelny komunikat i sciezke logu, zamiast blank screena.
  - mozna precyzyjnie ustalic pierwotna przyczyne na produkcji na podstawie logow.

## 18) P0 hotfix: ReferenceError `onOpenProjectStep` (v1.0.6)
- Potwierdzony root cause:
  - w `ProjectBar` JSX byl uzyty handler `onOpenProjectStep`, ale ten prop nie byl destrukturyzowany w sygnaturze funkcji komponentu.
  - efekt: `ReferenceError: onOpenProjectStep is not defined` i crash renderera przy starcie.
- Naprawa:
  - dodano brakujace propsy do destrukturyzacji `ProjectBar`:
    - `onOpenProjectStep`
    - `activeDiskProjectTitle`
  - bez zmiany zachowania UI/flow.

## 19) Bugfix v1 (workflow postaci): dublowanie postaci w Kroku 1
- Zdiagnozowane zrodlo:
  - deduplikacja castu i postaci roboczych byla oparta glownie o `id` / `name+role`, co nie stabilizowalo danych przy ponownych merge (AniList + lokalny stan projektu).
  - dodatkowo `addCastToWorkerByIds` budowal indeks `byName` tylko z `prev`, przez co w jednej operacji importu mogl dokladac powtorzenia zanim finalny merge je zobaczyl.
- Wdrozone poprawki (u zrodla, bez maskowania UI):
  - `dedupeAniListCast`:
    - klucz glowny po znormalizowanej nazwie postaci (`name`), fallback po `id` gdy brak nazwy,
    - stabilny merge pol (`gender`, `roleLabel`, opis, cechy, inferencje).
  - `dedupeAssignments`:
    - klucz glowny po znormalizowanej nazwie postaci,
    - merge profilu i metadanych bez produkowania duplikatow przy hydracji/ponownym zapisie.
  - `addCastToWorkerByIds`:
    - aktualizacja mapy `byName` w trakcie tej samej operacji dodawania (nie tylko z `prev`),
    - eliminuje dokladanie duplikatow podczas masowego dodania castu.
- Status:
  - etap 1 (bugfix duplikacji) zamkniety buildowo; kolejne etapy obejma model profilu i automatyczna analize AniList.

## 20) Etap 2: uporzadkowanie modelu profilu postaci i stylu globalnego (v1.0.8)
- Cel:
  - jawnie rozdzielic dane:
    - globalny styl projektu (ton calosci tlumaczenia),
    - indywidualny profil mowy postaci.
- Wdrozone zmiany modelu:
  - nowy modul `src/project/characterProfileModel.ts`:
    - `CharacterSpeechProfile`
    - `ProjectGlobalStyleProfile`
    - helpery normalizacji i domyslnych wartosci.
  - rozszerzony profil postaci o `personalitySummary`.
  - `ProjectTranslationStyleSettings` ma teraz jawny `globalStyleProfile` obok `globalStyle`.
- Wdrozone zmiany mapperow:
  - `src/project/projectMapper.ts`:
    - zapis i odczyt `globalStyleProfile`,
    - mapowanie `personalitySummary` w profilu postaci,
    - fallbacki dla starych projektow bez nowych pol.
  - `electron/projectStorage.ts` i `electron/preload.ts`:
    - aktualizacja kontraktow `DiskProjectConfigV1` o nowe pola (opcjonalne, kompatybilne).
- Kompatybilnosc:
  - zachowano `schemaVersion=1`,
  - stare projekty (bez `globalStyleProfile` i bez `personalitySummary`) sa poprawnie odczytywane przez fallbacki.
- Zakres celowo ograniczony:
  - bez ciezkiej przebudowy UI Kroku 2/3 na tym etapie,
  - fundament danych gotowy pod kolejny etap automatycznej analizy AniList.

## 21) Bugfix UX Krok 1: czysty stan sesji po otwarciu (v1.0.9)
- Problem:
  - prawa lista Kroku 1 (`workerCast`) byla automatycznie wypelniana przy otwarciu modalu na podstawie danych projektu (`settings.characters`), mimo braku wyszukania AniList w biezacej sesji.
- Root cause:
  - w `CharacterModal` podczas init (`open && !wasOpenRef.current`) wykonywano:
    - `setWorkerCast(normalizeDraftCharacters(settings.characters).map(...))`
  - to mieszalo dane trwale projektu z sesyjnym stanem roboczym Kroku 1.
- Naprawa:
  - Krok 1 startuje zawsze czysto:
    - `setSelectedAnime(null)`
    - `setSelectedAnimeCast([])`
    - `setWorkerCast([])`
  - dane trwale projektu pozostaja w `draft/settings` i sa dalej zapisywane/odczytywane, ale nie zasilaja automatycznie listy roboczej Kroku 1.
- Efekt:
  - po otwarciu Kroku 1 bez wyszukania:
    - pole wyszukiwania puste,
    - lewa lista pusta,
    - prawa lista pusta.

## 22) Domkniecie przeplywu AniList -> analiza profilu -> Krok 3 (v1.0.10)
- Zerwanie przeplywu (root cause):
  - analiza profilu byla tylko czesciowa i rozproszona; brak dedykowanego, stabilnego modułu auto-analizy profilu mowy postaci.
  - Krok 3 mial ograniczone bindowanie UI (widoczne glownie `speakingTraits` i `characterNote`), wiec nawet zapisane pola profilu nie byly realnie eksponowane.
- Naprawa end-to-end:
  - dodano moduł `src/project/characterProfileAnalysis.ts`:
    - `analyzeCharacterProfileFromAniList(cast)` buduje profil na podstawie:
      - `description`, `descriptionShort`, `personalityTraits`, inferred hints,
      - konserwatywnych fallbackow lingwistycznych (bez agresywnego zgadywania).
  - `CharacterModal` (Krok 1/2/3):
    - `buildPrefilledProfile` korzysta z analizy i wypelnia puste pola profilu,
    - priorytet danych zachowany:
      1) dane reczne uzytkownika (`base`),
      2) dane juz zapisane/projektowe,
      3) auto-analiza AniList tylko dla pustych pol.
  - Krok 3:
    - rozszerzono binding UI o pola profilu:
      - `personalitySummary`
      - `mannerOfAddress`
      - `politenessLevel`
      - `vocabularyType`
      - `temperament`
      - `anilistDescription`
- Efekt:
  - po zaladowaniu castu i dodaniu postaci do bazy roboczej, Krok 3 pokazuje realnie wypelnione profile tam, gdzie AniList daje dane.
  - profile zapisuja sie do projektu i wracaja po ponownym otwarciu (zgodnie z mapperami Etapu 2).

## 23) UI layout refactor: 3-zone workspace (v1.0.11)
- Zakres:
  - refaktor ukladu UI bez zmiany logiki biznesowej.
  - brak zmian w parserze ASS, pipeline tlumaczenia, projekcie, postaciach, pamieci, waveform, updaterze i IPC.
- Nowy uklad:
  - Top Bar:
    - Open, Save, tlmode, silnik, source/target, Translate all, Translate selected, Stop.
  - Left Sidebar:
    - narzedzia: API, Postacie, Pamiec, Koryguj plec, Zaladuj,
    - kontrolki projektu: selector projektu, TM info, Krok 0, Wczytaj,
    - pusta rezerwa na przyszle panele (AI context/assistant tools).
  - Main Work Area:
    - status aktualizacji,
    - tabela napisow,
    - edytor linii,
    - panel pamieci tlumaczeniowej,
    - waveform timeline.
- Video panel:
  - usunieto duzy `VideoPanel` z widoku (layout), pozostawiajac logike i handlery nietkniete.
- Efekt:
  - bardziej zwarty i przewidywalny workflow,
  - mniej marnowanego miejsca i wyrazny podzial narzedzi vs obszar roboczy.

## 24) UI correction po refaktorze layoutu (v1.0.12)
- Przywrocono podglad wideo w lewym sidebarze:
  - kontener podgladu nad przyciskami narzedzi,
  - wysokosc ~220 px, szerokosc = sidebar,
  - natywne kontrolki video (`play/pause/seek`),
  - podpiete istniejace handlery (`onLoadedMetadata`, `onDurationChange`, `onTimeUpdate`, `onError`) i ten sam `videoRef`.
- Zmiana etykiety przycisku:
  - `Zaladuj` -> `Dodaj wideo`.
- Korekta przestrzeni roboczej:
  - panel `Edycja linii` zmniejszony z 212px do 126px,
  - wiecej miejsca pionowego dla tabeli napisow.
- Zakres:
  - tylko korekta UI/layout; logika aplikacji bez zmian.

## 25) System charakterow postaci v1 (typ + podtyp) (v1.0.13)
- Zakres:
  - wdrozono pelny fundament typu i podtypu charakteru postaci w Kroku 3, z realnym wplywem na prompt tlumaczenia dla konkretnej postaci.
  - UI etykiety i opisy sa po polsku, logika wewnetrzna identyfikatorow po angielsku/ascii.
- Dane i architektura:
  - nowy modul danych:
    - `src/project/characterArchetypes.ts`
    - zawiera 25 glownych typow (m.in. Tsundere, Yandere, Kuudere, Bohater, Antybohater, Zloczynca, Mentor, Wojownik itd.)
    - kazdy typ ma liste podtypow oraz parametry mowy:
      - `tone`
      - `politenessLevel`
      - `emotionality`
      - `vocabularyType`
      - `mannerOfAddress`
      - `reactionStyle`
      - `speechPacing`
  - nowy helper promptu:
    - `src/project/characterArchetypePrompt.ts`
    - buduje instrukcje stylu mowy dla LLM na podstawie wybranego typu/podtypu.
  - rozszerzony model profilu postaci:
    - `characterTypeId`
    - `characterSubtypeId`
  - kompatybilnosc ze starymi danymi:
    - bez migracji schematu (dalej `schemaVersion=1`),
    - fallback mapuje stare `archetype` na nowe `type/subtype` tam, gdzie nowe pola sa puste.
- Krok 3 (UI):
  - dodano dwa nowe pola per postac:
    - `Typ charakteru`
    - `Podtyp charakteru`
  - dropdown podtypu filtruje opcje do aktualnie wybranego typu.
  - zachowano dotychczasowe pola reczne (`cechy mowienia`, `opis charakteru`, itd.).
- Wplyw na tlumaczenie:
  - `buildSystemPrompt` dostaje teraz:
    - wybrany typ i podtyp (PL label + id),
    - szczegolowa dyrektywe stylu wynikajaca z podtypu.
  - priorytet zapisany jawnie w promptcie:
    1) reczne pola postaci
    2) zapisane dane projektu
    3) typ/podtyp charakteru
    4) auto-analiza AniList
  - dla DeepL batch mode dodano guard: przy aktywnym typie/podtypie linie nie sa laczone w neutralny batch per projekt.
- Persistencja projektu:
  - `characterTypeId` i `characterSubtypeId` zapisywane/odczytywane w:
    - `src/project/projectMapper.ts`
    - `electron/projectStorage.ts`
    - `electron/preload.ts`
    - `src/electron.d.ts`
- Otwarte rzeczy (kolejny etap):
  - mozna rozszerzyc automatyczne przypisywanie typu/podtypu bezposrednio z analizy AniList (obecnie fallback idzie przez mapowanie legacy archetype -> type/subtype).

## 26) Notatki postaci miedzy Krokiem 2 a Krokiem 3 (v1.0.14)
- Dodano nowa funkcje `Profil / notatki postaci` jako dodatkowe zrodlo danych profilu:
  - przycisk w Kroku 2 (dolny obszar akcji, centralnie),
  - nowy modal `CharacterNotesModal` z duzym polem tekstowym dla kazdej postaci.
- Zakres danych:
  - nowe pole profilu postaci: `characterUserNotes`,
  - zapis/odczyt w projekcie przez mappery i kontrakty Electron:
    - `src/project/projectMapper.ts`
    - `electron/projectStorage.ts`
    - `electron/preload.ts`
    - `src/electron.d.ts`
- Integracja z Krokiem 3:
  - Krok 3 wyswietla i pozwala edytowac `Notatki użytkownika (Krok 2)` na karcie postaci.
  - notatki sa mapowane do profilu przez helper `mergeUserNotesIntoProfile`:
    - uzupelnia tylko puste pola (`speakingTraits`, `characterNote`, `personalitySummary`, `temperament`, `mannerOfAddress`, `vocabularyType`, `politenessLevel`),
    - nie nadpisuje recznie uzupelnionych pol Kroku 3.
- Integracja z promptem tlumaczenia:
  - `TranslationRequestContext` i `buildSystemPrompt` dostaja `characterUserNotes`,
  - prompt ma jawnie wpisany priorytet:
    1) reczne pola Kroku 3,
    2) notatki postaci z Kroku 2,
    3) zapisane dane projektu,
    4) typ/podtyp charakteru,
    5) analiza AniList.
  - notatki dzialaja per postac (nie globalnie).

## 27) Auto-analiza notatek postaci Krok 2 -> Krok 3 (v1.0.15)
- Domknieto brakujacy etap: notatki postaci sa teraz analizowane heurystycznie i automatycznie mapowane na profil postaci.
- Nowy modul:
  - `src/project/characterNotesAnalysis.ts`
  - odpowiedzialny za:
    - wykrywanie slow kluczowych i wzorcow opisu postaci,
    - scoring sugestii `typ + podtyp`,
    - budowe podpowiedzi dla pol profilu:
      - `speakingTraits`
      - `characterNote`
      - `personalitySummary`
      - `mannerOfAddress`
      - `politenessLevel`
      - `vocabularyType`
      - `temperament`
    - bezpieczne scalanie z priorytetami (nie nadpisuje recznych pol Kroku 3).
- Priorytet praktyczny po wdrozeniu:
  1) reczne pola Kroku 3,
  2) analiza notatek Kroku 2,
  3) typ/podtyp (w tym sugestie z analizy notatek),
  4) dane zapisane/projektowe,
  5) analiza AniList.
- Zachowanie typu/podtypu:
  - analiza notatek moze podmienic `type/subtype`, ale tylko gdy obecna wartosc wyglada na domyslna/legacy (fallback po archetype),
  - gdy user ustawil niestandardowy typ/podtyp recznie, heurystyka go nie nadpisuje.
- Integracja:
  - `src/App.tsx`:
    - analiza odpalana przy edycji notatek i przy inicjalizacji modalu (dla juz zapisanych notatek),
    - Krok 3 od razu pokazuje auto-uzupelnione pola tam, gdzie sa puste,
    - prompt tlumaczenia dostaje notatki + efekt uzupelnionego profilu.
  - `src/project/characterUserNotesProfile.ts`:
    - uproszczony wrapper zgodny wstecznie, delegujacy do nowego modulu analizy.

## 28) Etap jakosciowy: test i dopracowanie mapowania notatek (v1.0.16)
- Cel:
  - podniesienie jakosci mapowania `notatki uzytkownika -> profil postaci -> styl tlumaczenia`.
- Wdrozone usprawnienia heurystyk:
  - rozszerzono reguly o brakujace typy/scenariusze:
    - `genki / energiczna`
    - `postac_komediowa / przesadzona`
    - `mentor / spokojny_nauczyciel`
  - dodano reguly `phrase boost` (kombinacje slow) dla trafniejszego wyboru typu/podtypu, m.in.:
    - `niesmiala + zakochana`
    - `chlodna + zdystansowana`
    - `patrzy z gory + arogancka`
    - `zart + chaos`
    - `opiekuncza + troskliwa`
  - poprawiono inferencje cech mowy:
    - dodane sygnaly `energetyczna`, `komediowa`, `subtelna/miekka mowa`,
    - lepsze mapowanie `temperament`, `vocabularyType`, `mannerOfAddress`.
  - skorygowano formalnosc:
    - sam `dystans` nie podbija juz automatycznie formalnosci do wysokiej.
  - poprawiono skrot `characterNote`:
    - przy bardzo krotkiej pierwszej frazie laczy pierwsze dwa zdania (bardziej uzyteczny opis).
- Testy:
  - dodano testy jednostkowe:
    - `src/project/characterNotesAnalysis.spec.ts`
    - 5 scenariuszy charakterologicznych + test ochrony recznych pol Kroku 3.
  - wynik: wszystkie testy przechodza (`13/13`).
- Wynik jakosciowy:
  - notatki sa lepiej rozrozniane na profile:
    - niesmiala/zakochana vs chlodna/zdystansowana vs wredna/arogancka vs energiczna/komediowa vs opiekuncza/spokojna.
  - poprawiono rozroznialnosc stylu w promptach tlumaczenia per postac.

## 29) Naprawa flow Kroku 0 i przycisku Wczytaj (v1.0.17)
- Uporzadkowano docelowy podzial:
  - `Krok 0` = tworzenie nowego projektu,
  - `Wczytaj` = otwieranie istniejacego projektu przez wybor folderu.
- UI Kroku 0:
  - modal wyrównany i bardziej proporcjonalny:
    - szerszy kontener,
    - rowne panele `Nowy projekt` / `Otwórz istniejący projekt`,
    - spojna wysokosc i rozmieszczenie akcji.
- Flow tworzenia projektu:
  - `Utworz i przejdz do Kroku 1` teraz:
    1) tworzy projekt na dysku,
    2) od razu ponownie otwiera go z dysku (weryfikacja realnego zapisu),
    3) ustawia aktywny projekt,
    4) zamyka Krok 0,
    5) automatycznie otwiera modal `Postacie` (Krok 1).
- Flow otwierania istniejacego projektu:
  - przycisk `Wczytaj` w glownym UI:
    - otwiera systemowy wybór folderu projektu,
    - wczytuje projekt z wybranego folderu,
    - ustawia go jako aktywny i hydratuje stan aplikacji.
- Architektura:
  - dodano wspolny handler `openDiskProjectByDirectory(...)`, aby uniknac rozjazdu logiki miedzy:
    - otwarciem z modalu Kroku 0,
    - otwarciem z przycisku `Wczytaj`.

## 30) Polautomatyczne przypisywanie postaci do linii z lewego panelu (v1.0.18)
- Dodano nowy panel w lewym sidebarze: `Postacie do przypisywania`.
  - umiejscowienie: pod podgladem wideo,
  - lista scrollowalna,
  - zrodlo danych: postacie aktywnego projektu (`styleSettings.characters`),
  - deduplikacja po znormalizowanej nazwie postaci.
- Zakres akcji panelu:
  - klik postaci -> przypisanie do wszystkich aktualnie zaznaczonych linii,
  - pozycja `Brak postaci` -> czyszczenie przypisania dla zaznaczonych linii,
  - pokazywana liczba zaznaczonych linii,
  - podswietlenie ostatnio przypisanej postaci (szybka praca seryjna).
- Integracja z tabela dialogow:
  - kolumna `Postac` aktualizuje sie natychmiast po kliknieciu w panelu.
- Trwalosc danych:
  - przypisania trafiaja do `rowsData` i do `lineCharacterAssignments` (stan projektu),
  - autozapis projektu zapisuje je do `animegate-project.json`,
  - po ponownym otwarciu projektu i pliku ASS przypisania sa przywracane przez `applyProjectLineAssignments`.
- Architektura:
  - wydzielono komponent `CharacterAssignmentPanel` w `src/App.tsx` (bez ingerencji w pipeline tlumaczenia, parser ASS, waveform, updater i IPC).

## 31) Inteligentne sugestie postaci do linii (v1.0.19)
- Dodano heurystyczny ranking 2-3 kandydatow dla aktualnie zaznaczonej linii.
- Nowy modul:
  - `src/project/characterAssignmentSuggestions.ts`
  - wejsciowe dane: zaznaczona linia, sasiednie linie, dostepne postacie projektu, historia ostatnio uzywanych postaci.
  - wyjscie: posortowane sugestie `name + score + reasons` (top 3).
- Heurystyka rankingu (v1):
  - poprzednia przypisana linia (najsilniejszy sygnal),
  - nastepna przypisana linia,
  - bliskie linie o tym samym stylu,
  - bliskosc czasowa sceny (roznica czasu start/end),
  - historia ostatnio przypisywanych postaci,
  - fallback do najczesciej przypisywanych postaci, gdy brak silnych sygnalow.
- UI:
  - panel `Sugestie (1/2/3)` pod lista postaci w lewym sidebarze,
  - klik sugerowanej postaci przypisuje ja identycznie jak klik z listy postaci.
- Skróty klawiaturowe:
  - `1`, `2`, `3` zatwierdzaja odpowiednio pierwsza, druga i trzecia sugestie,
  - aktywne tylko poza polami edycji i poza modalami.
- Zachowanie:
  - brak auto-przypisania bez akcji uzytkownika,
  - po akcji uzytkownika kolumna `Postac` aktualizuje sie natychmiast,
  - przypisania dalej zapisuja sie do projektu przez istniejacy autozapis (`lineCharacterAssignments`).

## 32) Panel postaci: siatka 4-kolumnowa z obrazkami (v1.0.20)
- Przebudowano panel `Postacie do przypisywania` z listy pionowej do siatki kart:
  - 4 kolumny,
  - pionowy scroll dla wiekszej liczby postaci,
  - karta postaci: obrazek/avatara + imie + drobny opis (plec/rola).
- Dodano wydzielony komponent UI:
  - `src/components/CharacterAssignmentGrid.tsx`
  - odpowiedzialny za render kart, hover/active state i sekcje sugestii.
- Integracja danych obrazkow:
  - panel korzysta z lokalnego cache obrazkow postaci per projekt (`charImageCacheKey(projectId)`),
  - mapowanie po znormalizowanej nazwie postaci.
- Fallback obrazu:
  - gdy brak URL lub obraz sie nie laduje -> karta pokazuje placeholder z inicjalem postaci na tle `avatarColor`.
- Logika przypisywania bez zmian:
  - klik karty nadal przypisuje postac do zaznaczonej linii lub wielu linii,
  - `Brak postaci` nadal czyści przypisanie,
  - zapis projektu i autozapis pozostaja zgodne z obecnym flow.

## 33) Podglad wideo i synchronizacja linia <-> scena (v1.0.21)
- Wzmocniono workflow pracy z wideo:
  - klik linii dialogowej nadal wykonuje seek do startu linii, a dodatkowo wyrazniej stabilizuje aktywny wybor,
  - podczas odtwarzania synchronizacja czasu aktualizuje aktywna linie i zaznaczenie (`selectedId` + pojedyncze `selectedLineIds`).
- Dodano auto-scroll aktywnej linii:
  - tabela dialogow przewija sie automatycznie, aby aktywna linia byla widoczna (`scrollIntoView` w `LinesView`).
- Dopracowano podswietlenie aktywnej linii:
  - mocniejsze tlo aktywnej pozycji,
  - grubsza lewa belka akcentu,
  - delikatny wewnetrzny outline aktywnego wiersza.
- Dodano powiekszony podglad wideo:
  - przycisk `Powieksz podglad` w sekcji mini-playera (lewy sidebar),
  - modal z duzym playerem sceny.
- Dodano overlay napisow w powiekszonym podgladzie:
  - oryginal u gory,
  - polski tekst na dole,
  - czytelny styl (biale napisy + cien + polprzezroczyste tlo).
- Spacja = play/pause:
  - utrzymano globalny skrót play/pause poza polami tekstowymi,
  - wpisywanie spacji w polach edycji pozostaje bez zmian (guard dla input/textarea/contentEditable).

## 34) Pływające okno podglądu sceny: drag + resize (v1.0.22)
- Naprawiono problem sztywnego, centralnego modala podglądu sceny:
  - powiększony podgląd działa teraz jako pływające okno robocze.
- Dodano nowy komponent:
  - `src/components/FloatingVideoPreview.tsx`
  - odpowiedzialny za:
    - przeciąganie okna za pasek nagłówka,
    - zmianę rozmiaru z prawego dolnego rogu,
    - ograniczenie pozycji/rozmiaru do viewportu aplikacji,
    - zachowanie ostatniej pozycji i rozmiaru w bieżącej sesji (`sessionStorage`).
- Integracja z istniejącym playerem:
  - zachowano dotychczasową logikę synchronizacji czasu z głównym playerem,
  - overlay napisów nadal działa:
    - oryginał u góry,
    - polski na dole.
- Zachowanie funkcjonalne bez regresji:
  - spacja nadal steruje play/pause (poza polami tekstowymi),
  - klik linii nadal wykonuje seek do sceny i utrzymuje synchronizację.

## 35) Fix krytyczny: `Wczytaj` istniejącego projektu nie nadpisuje stanu z dysku (v1.0.23)
- Zdiagnozowana przyczyna:
  - po `openProject -> hydrateFromDiskProject(...)` następował wtórny hydration z katalogu projektu (`seriesProjects`) i localStorage, który mógł nadpisać świeżo odczytany stan z `animegate-project.json`.
- Naprawa:
  - dodano jawny guard dla ścieżki hydracji z dysku:
    - `pendingDiskHydrationProjectIdRef`,
    - ustawiany w `hydrateFromDiskProject` razem z `hydratedProjectIdRef` przed zmianą `currentProjectId`,
    - efekt hydracji katalogowej pomija jednorazowo nadpisanie dla właśnie wczytanego projektu z folderu.
- Efekt:
  - `Wczytaj` po wskazaniu folderu utrzymuje dane z pliku projektu jako źródło prawdy (bez regresyjnego overwrite).
  - poprawnie przywracane są:
    - aktywny projekt i metadane,
    - ustawienia tłumaczenia (`sourceLang`, `targetLang`, `preferredModelId`),
    - `styleSettings` (profile postaci, notatki, typ/podtyp, ustawienia kroków 2/3),
    - `lineCharacterAssignments` dla dalszego mapowania linii.

## 36) Fix krytyczny: `Wczytaj` wybiera plik projektu i poprawnie go wykrywa (v1.0.24)
- Zdiagnozowana przyczyna:
  - flow `Wczytaj` byl oparty glownie o wybor folderu, co w praktyce utrudnialo wskazanie pliku projektu i prowadzilo do scenariusza "pusty katalog / brak plikow do otwarcia".
  - loader oczekiwal katalogu projektu, a nie obslugiwal jawnie sciezki do pliku projektu.
- Naprawa:
  - dodano nowy IPC `project:pickFile` (dialog wyboru pliku projektu) z filtrami:
    - `*.json`
    - `*.agproj`
  - `openProjectFromDisk(...)` w `electron/projectStorage.ts` przyjmuje teraz:
    - sciezke katalogu projektu **albo**
    - bezposrednia sciezke do pliku projektu.
  - zaktualizowano preload/typy renderera i flow w `App.tsx`, aby `Wczytaj`:
    - najpierw otwieral wybor pliku projektu,
    - a jako fallback nadal pozwalal wybrac folder.
- Diagnostyka:
  - dodano wymagane logi startowe:
    - `projectPath`
    - `projectFileFound`
    - `projectLoaded`
- Efekt:
  - `Wczytaj` poprawnie otwiera istniejacy projekt po wskazaniu pliku lub folderu,
  - aktywny projekt jest ustawiany i hydracja danych projektu uruchamia sie prawidlowo.

## 37) Stabilizacja systemu postaci: obrazki + aliasy nazw + korekta `Unknown` (v1.0.25)
- Naprawa obrazkow postaci po `Wczytaj` projektu:
  - glowna przyczyna: URL obrazka nie byl trwale serializowany w danych projektu (`animegate-project.json`), a UI opieral sie glownie o lokalny cache.
  - dodano `imageUrl` do modelu postaci:
    - `src/translationStyle.ts` (`CharacterStyleAssignment`),
    - `src/project/projectMapper.ts` (`DiskProjectCharacter` mapowanie app <-> disk),
    - `electron/projectStorage.ts` i `electron/preload.ts` (typy IPC),
    - `src/electron.d.ts` (typy renderera).
  - odtworzenie cache obrazkow jest teraz scalane z danymi projektu:
    - build cache z `styleSettings.characters[].imageUrl`,
    - merge z lokalnym cache per-projekt (`charImageCacheKey`),
    - fallback na inicjal tylko gdy realnie brak URL.
- Usprawnione dopasowanie nazw postaci (alias matching):
  - wydzielono nowy modul: `src/project/characterNameMatching.ts`.
  - logika dopasowania obejmuje:
    - pelna nazwe (znormalizowana),
    - alias z tokenami,
    - imie, nazwisko,
    - odwrocona kolejnosc imie/nazwisko,
    - dopasowanie po tokenach z preferencja postaci z rozpoznana plcia.
  - podpiecie w kluczowych miejscach:
    - `App.tsx` (`resolveCharacterForLineName`, normalizacja),
    - `src/translationStyle.ts` (`findCharacterByName`),
    - `src/project/assignmentMatching.ts` (normalizacja aliasow w restore przypisan).
  - dodano testy jednostkowe aliasow:
    - `src/project/characterNameMatching.spec.ts` (full name / first name / surname / reversed order).
- Korekta plci `Unknown` (Krok 2) dopracowana pod szybka prace:
  - dodano filtr `Tylko Unknown` / `Pokaz wszystkie`,
  - dla kazdej postaci szybkie akcje jednym kliknieciem:
    - `M` (Mezczyzna),
    - `K` (Kobieta),
    - `N` (Neutralna / bez zmiany),
  - zmiana jest aktualizowana jednoczesnie w `workerCast` i `draft.characters`,
  - dane zapisuja sie do projektu i wracaja po ponownym otwarciu.

## 38) Fix stanu panelu postaci przed `Wczytaj` projektu (v1.0.26)
- Problem:
  - panel `Postacie do przypisywania` renderowal dane zanim byl aktywny projekt, co powodowalo widok kart/sugestii na "zimnym" starcie.
- Naprawa logiki stanu:
  - startup bez aktywnego projektu:
    - `activeDiskProject` startuje jako `null`,
    - modal Kroku 0 (`isProjectStepOpen`) startuje jako `true`,
    - usunieto automatyczne otwieranie zapamietanego projektu przy starcie.
  - panel postaci renderuje dane tylko dla aktywnego projektu:
    - `assignmentCharacters = []` i `assignmentSuggestions = []` gdy `activeDiskProject === null`,
    - `CharacterAssignmentGrid` dostaje `projectLoaded` i przy `false` pokazuje tylko komunikat:
      - `Wczytaj lub utworz projekt, aby zobaczyc postacie do przypisywania.`
  - hydracja/uzupelnianie postaci z linii ASS jest zablokowane bez aktywnego projektu.
- Reset przy przejsciu do Kroku 0:
  - dodano `handleEnterProjectStep`, ktory czysci stan projektowy panelu:
    - `activeDiskProject`,
    - `projectLineAssignments`,
    - `assignmentImageCacheByName`,
    - `activeAssignmentCharacter`,
    - `recentCharacterHistory`,
    - `styleSettings` (do pustego kontekstu bez postaci),
  - po tym panel wraca do stanu pustego.

## 39) Etap 1: powiekszony podglad jako osobne okno systemowe (v1.0.27)
- Zmieniono architekture podgladu:
  - `Powieksz podglad` otwiera teraz osobne okno Electron (`BrowserWindow`), a nie modal wewnatrz glownego UI.
- Main process (`electron/main.ts`):
  - dodano globalne zarzadzanie oknem podgladu (`previewWindow`) oraz stanem podgladu (`detachedPreviewState`),
  - dodano IPC:
    - `preview:openWindow`,
    - `preview:closeWindow`,
    - `preview:updateState`,
    - `preview:getState`,
    - `preview:togglePlayback` (komenda do glownego okna).
  - dodano zapis/odczyt pozycji i rozmiaru okna podgladu:
    - plik `preview-window-state.json` w `userData`,
    - okno zapamietuje `x/y/width/height` miedzy uruchomieniami.
  - dodano ladowanie renderer route przez hash (`#video-preview`) dla osobnego okna.
- Preload / API:
  - rozszerzono `electron/preload.ts` i `src/electron.d.ts` o jawne, bezpieczne API:
    - otwieranie/zamykanie okna podgladu,
    - push stanu podgladu,
    - subskrypcja stanu (`onDetachedPreviewState`),
    - subskrypcja komend (`onDetachedPreviewCommand`).
- Renderer:
  - dodano nowy komponent `src/components/DetachedVideoPreviewWindow.tsx`:
    - wyswietla wideo,
    - overlay napisow: oryginal u gory, polski na dole,
    - obsluga `spacja` i klik wideo -> komenda play/pause do glownego okna,
    - przycisk `Zamknij`.
  - `src/main.tsx` renderuje osobny komponent dla route `#video-preview`.
  - `src/App.tsx`:
    - usunieto stary modal `FloatingVideoPreview` z glownego okna,
    - przycisk `Powieksz podglad` otwiera osobne okno systemowe,
    - stan podgladu (src, czas, pause/play, rate, napisy) jest synchronizowany do okna podgladu przez IPC,
    - komenda play/pause z okna podgladu wraca do glownego playera.

## 40) Quality fix: ASS preprocessor + context poprzedniej linii (v1.0.28)
- Cel:
  - poprawic jakosc pipeline tlumaczenia bez psucia round-trip ASS.
- Zmiany architektoniczne:
  - dodano nowy modul `src/project/assTranslationPreprocessor.ts` z jawnymi helperami:
    - `tokenizeAssForTranslation` (dzieli tekst na chunki `text` i markery techniczne ASS),
    - `stripAssFormattingForTranslation` (usuwa z semantyki `{...}`, `\\N`, `\\h`),
    - `hasTranslatableAssText`,
    - `hasAssTechnicalMarkers`,
    - `buildContinuationContextFromPreviousLine` (detekcja kontynuacji zdania z poprzedniej linii).
- Integracja z pipeline:
  - `App.tsx` korzysta teraz z nowego preprocessora zamiast lokalnych regexow.
  - tlumaczenie per-linia nadal zachowuje tagi ASS i `\\N`, ale do silnika trafiaja tylko chunki semantyczne.
  - dodano pole kontekstu `previousLineContinuation` do `TranslationRequestContext`.
  - przy tlumaczeniu biezacej linii, gdy poprzednia (po oczyszczeniu ASS) konczy sie przecinkiem / wielokropkiem / znakiem kontynuacji,
    kontekst poprzedniej linii jest dopinany do promptu (LLM) i do parametru `context` DeepL.
- Bezpieczenstwo i regresje:
  - batch DeepL jest automatycznie pomijany dla linii z markerami ASS lub dla linii wymagajacych kontekstu kontynuacji,
    aby nie utracic bezpiecznej sciezki per-linia zachowujacej tagi.
- Testy:
  - dodano `src/project/assTranslationPreprocessor.spec.ts`:
    - przypadki `\\Ncreate`, `\\NTino`, `{\\an8}Hello`, `{\\i1}Please{\\i0} wait`,
    - detekcja kontynuacji po przecinku,
    - brak laczenia po kropce.

## 41) Heurystyka nazw nieprzetlumaczalnych (proper noun / special term) (v1.0.29)
- Dodano modul `src/project/translationHeuristics.ts`:
  - funkcja `isNonTranslatableProperNounLine(...)` wykrywa linie wygladajace jak nazwy wlasne/specjalne terminy (np. techniki, nazwy miejsc, nazwiska), na podstawie konserwatywnych heurystyk:
    - krotka linia (1-4 slowa),
    - brak typowych czasownikow,
    - slowa title-case/UPPERCASE,
    - silny sygnal typu wykrzyknik/pytajnik lub pojedyncza nazwa.
- Integracja z pipeline tlumaczenia (`App.tsx`):
  - przed wyslaniem linii do silnika tlumaczenia wykonywana jest heurystyka,
  - jesli linia jest wykryta jako nieprzetlumaczalna:
    - silnik nie jest wywolywany,
    - `target` dostaje oryginalna tresc semantyczna (`row.source`),
    - ustawiana jest flaga `requiresManualCheck = true`,
    - status linii ustawiany jest na `draft` (do sprawdzenia).
- UI:
  - `LinesView` podswietla takie linie i pokazuje prefiks `⚠` w kolumnie tlumaczenia.
- Zachowanie edycji recznej:
  - reczna edycja tlumaczenia (`handleChangeLineTarget`) automatycznie czyści `requiresManualCheck`,
  - to samo przy podmianie przez sugestie TM i korekcie plci.
- Testy:
  - dodano `src/project/translationHeuristics.spec.ts` z przypadkami:
    - `Arena Rex!`, `Shadow Burst!`, `Tino!`, `Grand Palace` -> wykrywane,
    - normalne zdania -> niewykrywane.

## 42) Fix layout: napisy zakotwiczone do obrazu w osobnym oknie preview (v1.0.30)
- Problem:
  - w oknie `Powiekszony podglad` napisy byly pozycjonowane wzgledem calego viewportu okna,
    przez co przy malych rozmiarach mogly wypasc poza obszar obrazu (na czarne pasy).
- Naprawa:
  - `src/components/DetachedVideoPreviewWindow.tsx`:
    - dodano referencje kontenera preview (`previewAreaRef`) i stan `videoFrame` (left/top/width/height),
    - dodano wyliczanie rzeczywistego prostokata obrazu dla `object-fit: contain` na podstawie:
      - rozmiaru kontenera,
      - natywnego aspect ratio materialu (`videoWidth`/`videoHeight`),
    - dodano `ResizeObserver`, aby po zmianie rozmiaru okna przeliczac obszar obrazu,
    - overlay napisow renderowany jest teraz wewnatrz absolutnie pozycjonowanego wrappera o wymiarach `videoFrame`.
- Efekt:
  - napisy (gora/dol) sa zawsze osadzone na obrazie wideo,
  - przy malym, srednim i duzym oknie pozostaja zakotwiczone i wycentrowane,
  - skalowanie okna nie wypycha napisow poza obraz.

## 43) Fix: lista dialogow pusta przed wczytaniem projektu (v1.0.31)
- Naprawiono stan startowy aplikacji:
  - `rowsData` inicjalizuje sie teraz jako `[]` (bez danych demo),
  - `selectedId` startuje od `0`,
  - `selectedLineIds` startuje jako pusty `Set`.
- Dodano jawny reset stanu obszaru napisow:
  - nowa funkcja `resetSubtitleWorkspaceState()` czyści:
    - `rowsData`,
    - `selectedId`,
    - `selectedLineIds`,
    - `loadedSubtitleFile`,
    - `loadedFileName`,
    - `loadedFilePath`,
    - `projectLineAssignments`.
- Reset jest wykonywany:
  - przy hydracji projektu z dysku (`hydrateFromDiskProject`) przed zaladowaniem metadanych,
  - przy powrocie do Kroku 0 (`handleEnterProjectStep`).
- `LinesView`:
  - dodano warunkowy placeholder zamiast linii, gdy `rowsData.length === 0`:
    - bez aktywnego projektu: `Wczytaj lub utworz projekt, aby zobaczyc liste dialogow.`,
    - z aktywnym projektem, ale bez ASS: `Brak wczytanego pliku napisow. Otworz plik ASS, aby zobaczyc dialogi.`
- Efekt:
  - przed Krok 0 / przed `Wczytaj` lista dialogow jest pusta,
  - po `Wczytaj`/`Utworz projekt` linie pojawiaja sie dopiero po wczytaniu ASS,
  - powrot do Kroku 0 czyści stan i nie zostawia danych poprzedniego projektu w UI.

## 44) Masowe wklejanie notatek postaci (bulk import) (v1.0.32)
- Dodano nowy parser: `src/project/bulkCharacterNotesParser.ts`.
  - Wejscie: surowy tekst + lista postaci projektu.
  - Dzialanie:
    - wykrywa naglowki sekcji jako potencjalne nazwy postaci,
    - dopasowuje nazwy przez `resolveCharacterByName` (pelna nazwa, aliasy, imie/nazwisko, odwrocona kolejnosc),
    - zbiera kolejne linie jako opis do nastepnego naglowka,
    - zwraca wynik: `matched` + `unmatchedSections` + `totalSections`.
- Dodano testy parsera: `src/project/bulkCharacterNotesParser.spec.ts`.
  - scenariusze: poprawny rozdzial sekcji + nierozpoznane naglowki.
- Rozszerzono UI modala notatek: `src/components/CharacterNotesModal.tsx`.
  - nowy przycisk: `Wklej zbiorcze notatki`,
  - nowy modal importu z duzym textarea,
  - akcja `Rozdziel notatki` + podsumowanie:
    - liczba sekcji,
    - liczba dopasowanych postaci,
    - lista nierozpoznanych naglowkow,
  - akcja `Zastosuj do postaci`.
- Dodano bezpieczne tryby zapisu notatek:
  - `safe_append` (domyslny): nadpisuje puste, do istniejacych dopisuje,
  - `fill_empty_only`: uzupelnia tylko puste pola,
  - `overwrite_all`: nadpisuje wszystko.
- Integracja w `src/App.tsx` (CharacterModal):
  - nowy handler `handleApplyBulkCharacterUserNotes`,
  - po zastosowaniu notatek kazda zmiana przechodzi przez `mergeCharacterNotesAnalysisIntoProfile`,
    wiec dalej zasila Krok 3 i prompt tlumaczenia tak samo jak reczne notatki.

## 45) Translation QA Hardening – ETAP 1 (preprocessing + context) (v1.0.33)
- Wydzielono sanitizacje tekstu do nowego modulu `src/project/subtitleTextSanitizer.ts`:
  - `normalizeSemanticWhitespace` — normalizacja whitespace po oczyszczeniu tresci (spacje/newline/tab),
  - `sanitizeTranslationChunk` — sanitizacja chunkow wysylanych do silnika z zachowaniem krawedziowych odstepow (bez psucia skladania przy tagach ASS).
- Dodano nowy modul kontekstu `src/project/translationContextBuilder.ts`:
  - `buildTranslationLineContextHints(rows, rowIndex)` zwraca:
    - `previousLineContinuation` (np. poprzednia linia konczy sie przecinkiem/wielokropkiem),
    - `nextLineHint` (gdy biezaca linia jest urwana i kolejna jest logicznym hintem).
- `src/project/assTranslationPreprocessor.ts`:
  - `buildContinuationContextFromPreviousLine` korzysta teraz z normalizacji semantycznego whitespace,
    co stabilizuje kontekst po usunieciu `{...}` i `\\N`.
- Integracja w pipeline (`src/App.tsx`):
  - `translateSubtitleLinePreservingTags` tlumaczy juz zsanityzowane chunki (`sanitizeTranslationChunk`),
  - `translateSingleRow` pobiera kontekst z `translationContextBuilder` (previous + opcjonalny next hint),
  - prompt translacyjny otrzymuje dodatkowe instrukcje i `Next line hint` bez zmiany kontraktu round-trip ASS.
- Testy regresji dodane:
  - `src/project/subtitleTextSanitizer.spec.ts`,
  - `src/project/translationContextBuilder.spec.ts`.
- Istniejace testy preprocessingu ASS dalej przechodza (`assTranslationPreprocessor.spec.ts`), w tym przypadki:
  - `\\Ncreate`, `\\NTino`, `{\\an8}Hello`, `{\\i1}Please{\\i0} wait`,
  - oraz kontekst przecinka (`He was crying,` -> `quietly, alone.`).

## 46) Kontrola bezpieczenstwa ETAPU 1 + fix round-trip whitespace (v1.0.34)
- Wykonano dodatkowa kontrole na realnych plikach ASS z repo:
  - `basic.ass`,
  - `tags.ass`,
  - `newline.ass`,
  - `tlmode.ass`,
  - oraz dodatkowym scenariuszu inline (linie tylko z tagami, wielokrotne tagi, urwanie przecinkiem, wielokropek, niestandardowy whitespace).
- Wynik kontroli:
  - round-trip `parse -> serialize -> parse` zachowuje `sourceRaw`, `source`, liczbe wierszy i markery ASS (`\\N`, `{...}`).
- Wykryty edge case:
  - serializer przy zapisie przycinal `sourceRaw` przez `.trim()`, co moglo gubic skrajne spacje.
- Naprawa:
  - `src/subtitleParser.ts`:
    - usunieto `.trim()` z zapisu `sourceRaw` (zachowanie wiernosci wejscia).
  - `src/subtitleParser.spec.ts`:
    - dodano regresje `preserves sourceRaw leading/trailing spaces and inner ASS tags`.
  - rozszerzono regresje preprocessingu:
    - `src/project/assTranslationPreprocessor.spec.ts` (linie tylko z tagami, niestandardowe spacje),
    - `src/project/translationContextBuilder.spec.ts` (kontekst z tagami i nierownym whitespace).
- Status:
  - ETAP 1 po poprawce jest bezpieczny operacyjnie dla round-trip w obsluzonych wzorcach.
  - Pozostajace ryzyka (do dalszej ochrony):
    - nietypowe, niestandardowe dialekty ASS/SSA z egzotycznymi znacznikami,
    - semantyka skrajnych odstepow celowo uzywanych jako efekt typograficzny.

## 47) Translation QA Hardening – ETAP 2 (continuity + tone + short-line guard) (v1.0.34)
- Dodano nowy modul `src/project/translationQualityGuards.ts`:
  - `isShortSubtitleUtterance` — wykrywa krotkie kwestie wymagajace ostrozniejszego tlumaczenia,
  - `buildChunkContextHints` — buduje kontekst semantyczny dla chunkow rozdzielonych tagami ASS,
  - `stabilizeTonePunctuation` — stabilizuje koncowki `?` / `!`, by nie gubic tonu,
  - `isOverAggressiveShortLineRewrite` — wykrywa nadmierne rozwijanie krotkich kwestii.
- Integracja z pipeline (`src/App.tsx`):
  - `TranslationRequestContext` rozszerzono o:
    - `isShortUtterance`,
    - `chunkPreviousHint`,
    - `chunkNextHint`.
  - Podczas translacji linii:
    - wyliczany jest guard krotkiej kwestii,
    - kazdy chunk tekstowy dostaje lokalne hinty poprzedni/nastepny chunk.
  - Prompt systemowy dostal instrukcje:
    - ciaglosc i ton bez halucynowania,
    - short-line guard (bez agresywnego rozwijania),
    - ograniczenie do tresci biezacej linii (kontekst tylko pomocniczy).
  - DeepL `context` dostaje teraz polaczony kontekst:
    - poprzednia linia,
    - hint nastepnej linii,
    - hinty chunkowe.
  - Po translacji:
    - stabilizacja tonu interpunkcja `?`/`!`,
    - automatyczne oznaczanie `requiresManualCheck` przy nadmiernym rozwinięciu krotkiej kwestii.
- Testy regresji:
  - nowy plik `src/project/translationQualityGuards.spec.ts`,
  - pokrycie:
    - short-line detection,
    - over-aggressive rewrite detection,
    - punctuation tone stabilization,
    - chunk context hints dla linii z tagami ASS.

## 48) Hotfix: STOP tłumaczenia jako stan kontrolowany (v1.0.35)
- Naprawiono krytyczny błąd renderera:
  - `window.unhandledrejection` nie przełącza już aplikacji na ekran krytyczny przy kontrolowanym anulowaniu tłumaczenia przez STOP.
- `src/App.tsx`:
  - dodano stan `translationCancelled`,
  - pipeline `runTranslationByLineIds` ma teraz jawny `catch` dla anulowania (`cancelled`/`AbortError`) i nie przepuszcza tego jako nieobsłużonego wyjątku,
  - anulowanie jest logowane jako normalny stan operacyjny, bez crashu,
  - wywołania `handleTranslateAll` i `handleTranslateSelected` mają bezpieczny `.catch(...)` na końcu (brak nieobsłużonych Promise rejection),
  - STOP ustawia `translationCancelled` i przerywa aktywny `AbortController`.
- UI:
  - dodano jawny status tłumaczenia obok aktywnego stylu:
    - `w toku`,
    - `anulowane (STOP)`,
    - `bezczynne`.
- `src/main.tsx`:
  - globalny listener `unhandledrejection` ignoruje kontrolowane anulowania (frazy cancel/abort/„Tlumaczenie zatrzymane przez uzytkownika”) i nie renderuje ekranu „Krytyczny błąd startu renderera”.
- Wynik:
  - STOP tłumaczenia działa jako normalny stan aplikacji,
  - brak krytycznego crasha renderera przy przerwaniu tłumaczenia przez użytkownika.

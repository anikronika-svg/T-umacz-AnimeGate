# PROJECT CONTEXT – Tlumacz AnimeGate

## 1) Stan projektu
- Data aktualizacji: 2026-03-11.
- Repozytorium Git: aktywne, branch `main`, zdalne `origin` (GitHub).
- Aktualna wersja aplikacji (`package.json`): `1.0.14`.
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

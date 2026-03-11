# PROJECT CONTEXT – Tlumacz AnimeGate

## 1) Stan projektu
- Data aktualizacji: 2026-03-11.
- Repozytorium Git: aktywne, branch `main`, zdalne `origin` (GitHub).
- Aktualna wersja aplikacji (`package.json`): `1.0.2`.
- Ostatnie commity:
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

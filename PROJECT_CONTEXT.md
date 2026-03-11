# PROJECT CONTEXT – Tlumacz AnimeGate

## 1) Stan projektu
- Data aktualizacji: 2026-03-11.
- Repozytorium Git: aktywne, branch `main`, zdalne `origin` (GitHub).
- Ostatnie commity:
  - `01ba205` – konfiguracja instalatora NSIS + `build:win`
  - `b129606` – stabilizacja wyboru silnika (stop flicker / auto-switch loop)
  - `fdc5265` – initial commit
- Biezacy etap (lokalnie, do push): Refaktor v1 Etap 0 + Etap 2 (baseline verify + testy parsera ASS round-trip).

## 2) Stack i architektura
- Electron (main/preload) + React + TypeScript + Vite.
- Kluczowe pliki:
  - `src/App.tsx` – glowny renderer i logika aplikacji.
  - `src/subtitleParser.ts` – parser i zapis ASS/SSA (`tlmode`).
  - `src/anilist.ts` – integracja AniList i merge castu serii.
  - `src/translationStyle.ts` – style, archetypy, profile postaci, kontekst tlumaczenia.
  - `electron/main.ts` – okno Electron, IPC, ffmpeg/waveform.
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
- Konfiguracja `electron-builder` (w `package.json`):
  - `appId`: `com.animegate.translator`
  - `productName`: `AnimeGate Translator`
  - target: `nsis`
  - `artifactName`: `AnimeGate-Translator-Setup.exe`
  - NSIS: `perMachine=true`, `oneClick=false`, skroty Desktop + Start Menu.
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
- Na ten moment auto-update NIE jest jeszcze wdrozony:
  - brak `electron-updater`,
  - brak `build.publish` dla GitHub Releases,
  - brak runtime updatera w `electron/main.ts`,
  - brak IPC/preload/UI dla statusu aktualizacji,
  - brak root `.github/workflows` dla release automation.
- Następny krok: mały etap foundation pod auto-update (konfiguracja publish + dependency), bez zmiany zachowania runtime.

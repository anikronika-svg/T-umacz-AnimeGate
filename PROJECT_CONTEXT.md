# PROJECT CONTEXT – Tłumacz AnimeGate

## 1) Stan źródeł i ograniczenia audytu
- Data audytu: 2026-03-10.
- Zakres przeanalizowany: wszystkie pliki w `src/`, `electron/`, `package.json`.
- Repozytorium w tym workspace nie zawiera `.git` (`NO_GIT_REPO`), więc historia commitów nie mogła zostać odczytana lokalnie.
- Opis poniżej opiera się na aktualnym stanie kodu.

## 2) Architektura projektu

### Stack
- Electron (main + preload + IPC)
- React + TypeScript
- Vite
- Node.js

### Główne pliki
- `src/App.tsx` – główny renderer: UI, pipeline tłumaczeń, moduł postaci, wideo, waveform, auto-timing.
- `src/subtitleParser.ts` – parser i zapis ASS/SSA z obsługą `tlmode`.
- `src/anilist.ts` – integracja z AniList (anime + postacie + relacje serii).
- `src/translationStyle.ts` – style tłumaczeń, profile postaci, archetypy, persist per-projekt.
- `electron/main.ts` – okno Electron, IPC plików/API, waveform + ffmpeg.
- `electron/preload.ts` – bezpieczny bridge `window.electronAPI`.
- `src/electron.d.ts` – typy API preload w rendererze.

## 3) Istniejące moduły aplikacji

### 3.1 Shell aplikacji (Electron)
- `main.ts` ładuje renderer:
  - dev: `process.env.VITE_DEV_SERVER_URL`
  - prod: `loadFile(path.join(__dirname, '../dist/index.html'))`
- Menu systemowe wyłączone (`Menu.setApplicationMenu(null)`).
- IPC:
  - `file:openSubtitle`, `file:readSubtitle`, `file:saveSubtitle`
  - `file:openVideo`
  - `video:getWaveform`
  - `api:getConfig`, `api:saveConfig`, `api:request`

### 3.2 Parser ASS/SSA + tlmode
- Parsowanie linii `Dialogue:` z prawidłowym split do pola tekstowego.
- Round-trip:
  - zachowanie `sourceRaw` (tagi ASS + `\N`),
  - UI operuje na `source` (oczyszczony tekst),
  - zapis tłumaczeń przywraca strukturę ASS.
- `tlmode`:
  - obsługa par linii (`TLmode` + linia tłumaczenia),
  - compat legacy (`" | "`) i nowy separator (`\x01`),
  - dopinanie nagłówków `TLMode` i stylu `TLmode` przy zapisie.

### 3.3 Pipeline tłumaczenia
- Tryby: `Tłumacz wszystko`, `Tłumacz zaznaczone`, `Stop`.
- Główna funkcja: `runTranslationByLineIds`.
- Preflight:
  - odfiltrowanie linii bez treści,
  - wykrywanie brakujących wierszy wejścia.
- Batchowanie:
  - domyślnie 20 linii / batch,
  - opóźnienia między batchami.
- Retry:
  - drugi przebieg dla `error`/`rate-limited`.
- Raport końcowy:
  - done/error/rate-limit/cancelled/skipped,
  - missing translation validation,
  - checksum wyników.
- Tłumaczenie preserve-tags:
  - tokenizacja ASS i tłumaczenie tylko segmentów tekstowych.

### 3.4 Providery API
- Skonfigurowane w kodzie providery:
  - `mymemory`, `libre`, `deepl`, `openai`, `openrouter`, `groq`, `together`, `mistral`, `claude`, `gemini`, `cohere`, `google`, `azure`, `papago`, `yandex`.
- Realnie zaimplementowane requesty dla:
  - MyMemory, Libre, DeepL, OpenAI-compatible, Claude, Gemini, Cohere, Google v2.
- Azure/Papago/Yandex: ścieżki z komunikatem `missing-config` (placeholder logic).
- Obsługa błędów:
  - timeout, network, 429, 403, 456,
  - `Retry-After` dla DeepL,
  - fallback przy błędach (Libre/MyMemory).

### 3.5 API keys i konfiguracja
- W rendererze: lokalny model `ApiConfig` + modal testów providerów.
- Persist:
  - lokalnie (`localStorage`) oraz przez IPC do `userData/api-config.json`.
- Główne wywołania HTTP mogą iść przez `electronAPI.apiRequest` (main process).

### 3.6 Moduł postaci
- Modal `Postacie AniList - przypisywanie do linii` z krokami:
  - Krok 1: wyszukiwanie anime + cast AniList + baza robocza,
  - Krok 2: korekta płci,
  - Krok 3: style/archetypy/profil postaci.
- Profile postaci:
  - `style`, `archetype`, `speakingTraits`, `characterNote`, `anilistDescription`, dodatkowe pola tonu.
- Persist stylów/profili:
  - `translationStyle.ts` (`saveProjectStyleSettings` / `loadProjectStyleSettings`).

### 3.7 AniList
- `searchAnimeByTitle`.
- `getAnimeCharacters`:
  - rola, płeć, obraz, opis postaci.
- `getAnimeCharactersForSeries`:
  - przejście relacji PREQUEL/SEQUEL,
  - merge postaci po `character.id`.
- Dane charakteru:
  - `description`,
  - `descriptionShort` (skrót),
  - `personalityTraits` (heurystyczna ekstrakcja).

### 3.8 Style tłumaczenia i archetypy
- Global style + per-postać style.
- Archetypy (m.in. `tsundere`, `formal_knight`, `child`, `elderly_man`, itd.).
- `buildTranslationStyleContext` buduje kontekst dla providera.
- Lokalny post-process dla języka PL:
  - różnicowanie stylów,
  - archetypowe rewrites,
  - lokalna korekta form płciowych.

### 3.9 Wideo + synchronizacja
- HTML5 `<video>` w rendererze.
- Kontrole:
  - play/pause/stop,
  - seek relative/absolute,
  - volume/mute/speed,
  - global spacebar (poza input/textarea/contenteditable).
- Synchronizacja z tabelą:
  - klik linii -> seek do startu,
  - timeupdate -> aktywacja pasującej linii.

### 3.10 Waveform + auto timing
- IPC `video:getWaveform` zwraca sampleRate/peaks/duration.
- Cache waveformu w `userData/waveform-cache`.
- Panel waveform i operacje auto-snap:
  - start/end/both,
  - selected/all.
- Algorytm `findSpeechBoundary` oparty o próg energii i minimalny run.

### 3.11 Bundled ffmpeg
- W `electron/main.ts` wykrywanie ffmpeg:
  - najpierw bundled (`resources/ffmpeg` i pochodne),
  - potem systemowy PATH.
- W `package.json`:
  - `extraResources` kopiuje katalog `ffmpeg` do paczki.

### 3.12 Projekty serii
- Katalog projektów w `localStorage` (`animegate.series-projects.v1`).
- UI: `+ Nowy projekt` i `Wczytaj projekt`.
- Persist metadanych projektu:
  - `title`, `anilistId`, `preferredModelId`, `sourceLang`, `targetLang`, `lastUpdated`.
- Persist ustawień stylów postaci per projekt.

## 4) Aktualny pipeline użytkownika (wg kodu)
1. Otwórz ASS/SSA -> parser buduje tabelę dialogów.
2. Opcjonalnie otwórz modal postaci:
   - Krok 1: pobierz cast AniList i zbuduj bazę roboczą,
   - Krok 2: popraw płeć,
   - Krok 3: ustaw style/archetypy/profile.
3. Uruchom tłumaczenie (`Tłumacz wszystko` / `Zaznaczone`).
4. Pipeline wykonuje batch/retry/fallback + raport końcowy.
5. Opcjonalnie korekta płci i ręczna edycja.
6. Zapis do `PL <oryginalna_nazwa>` przez `buildAssOrSsaContent`.

## 5) Aktualny etap developmentu (Sprint)
**Sprint: Stabilizacja E2E workflow tłumaczenia + narzędzia timingu + kontekst postaci**

Stan sprintu na podstawie kodu:
- Zaimplementowane fundamenty:
  - tłumaczenie masowe z raportowaniem i retry,
  - style/archetypy,
  - AniList z merge serii,
  - wideo + waveform + auto-snap,
  - bundled ffmpeg.
- Obszary nadal wymagające stabilizacji E2E (UI):
  - spójność kroków 1/2/3 w module postaci,
  - deduplikacja i prefill profili postaci w Kroku 3,
  - pełna walidacja wizualna zachowania po zmianach.

## 6) Znane niespójności techniczne (istotne dla dalszej pracy)
- Brak lokalnej historii commitów (`NO_GIT_REPO`) – kontekst zmian tylko z bieżącego kodu.
- `VIDEO_PROJECT_KEY` i `CHARACTER_IMAGE_CACHE_KEY` są spięte z `DEFAULT_PROJECT_ID`, a nie z aktywnym projektem (ryzyko przeciekania stanu między projektami).
- Część przycisków UI to placeholdery bez logiki (`Importuj .ass do TM`, `Analizuj styl`).

## 7) Nazwa projektu
Tłumacz AnimeGate

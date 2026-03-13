# TRANSLATION ENGINE ROADMAP

Cel: etapowe wdrazanie docelowego silnika tlumaczen zgodnie z "Translation Engine Vision".

## Etap 1: LineSemanticClassifier (priorytet 1)
Zakres:
- Nowy modul klasyfikujacy linie na: NORMAL_DIALOG, PROPER_NOUN, WORLD_TERM, INTERJECTION, SHORT_REPLY, UNCERTAIN.
- Uzycie klasyfikatora w przeplywie tlumaczenia (decyzja: tlumacz / przepisz / ostrzez).
- Testy regresji dla wskazanych przykladow.
Kryteria akceptacji:
- `Okay!`, `Hey!`, `Red`, `Hello, Uncle!`, `Yes, Auntie!` -> NORMAL_DIALOG / INTERJECTION / SHORT_REPLY i tlumaczenie normalne.
- `Yokohama`, `Hunter Guild`, `Red Flame`, `Shadow Burst!` -> PROPER_NOUN lub WORLD_TERM (bez agresywnego warningu).
- Ostrzezenie tylko dla UNCERTAIN.

## Etap 2: GenderResolver (priorytet 2)
Zakres:
- Centralny resolver formy tlumaczenia z plci postaci.
- Zasada: auto-ustawianie tylko gdy `translationGender` jest `unknown`/`neutral`.
Kryteria akceptacji:
- Brak nadpisywania ustawien recznych.
- Dziedziczenie formy plciowej po przypisaniu postaci do linii.

## Etap 3: DialogueContextEngine (priorytet 3)
Zakres:
- Spójny kontekst (previousLines=2, nextLines=1) dla tlumaczenia.
- Heurystyki kontynuacji w dialogu i krotkich odpowiedziach.
Kryteria akceptacji:
- Krotkie odpowiedzi typu "Shopping." tlumacza sie zgodnie z kontekstem.

## Etap 4: TerminologyResolver (priorytet 4)
Zakres:
- Slownik terminologii projektu `project_terms.json`.
- Dopasowanie przed wywolaniem AI.
Kryteria akceptacji:
- Terminologia swiata jest konsekwentna i nie jest tlumaczona dowolnie.

## Etap 5: CharacterPersonalityEngine (priorytet 5)
Zakres:
- Profil mowy postaci na bazie opisu + notatek + analizy dialogow.
- Kontekst tlumaczenia z profilem postaci.
Kryteria akceptacji:
- Styl wypowiedzi jest stabilny i zgodny z profilem.

## Etap 6: TranslationMemoryEngine (priorytet 6)
Zakres:
- Pamięć tlumaczen (translationMemory.json) uzywana przed AI.
- Import/eksport i scalenie pamieci miedzy projektami.
Kryteria akceptacji:
- Tlumaczenia powtarzalne sa spójne w ramach serii.

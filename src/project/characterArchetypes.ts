import type { CharacterArchetypeId } from '../translationStyle'

export interface CharacterSpeechTuning {
  tone: string
  politenessLevel: string
  emotionality: string
  vocabularyType: string
  mannerOfAddress: string
  reactionStyle: string
  speechPacing: string
}

export interface CharacterSubtypeOption {
  id: string
  label: string
  description: string
  speech: CharacterSpeechTuning
}

export interface CharacterTypeOption {
  id: string
  label: string
  description: string
  subtypes: CharacterSubtypeOption[]
}

function speech(
  tone: string,
  politenessLevel: string,
  emotionality: string,
  vocabularyType: string,
  mannerOfAddress: string,
  reactionStyle: string,
  speechPacing: string,
): CharacterSpeechTuning {
  return { tone, politenessLevel, emotionality, vocabularyType, mannerOfAddress, reactionStyle, speechPacing }
}

function sub(
  id: string,
  label: string,
  description: string,
  tuning: CharacterSpeechTuning,
): CharacterSubtypeOption {
  return { id, label, description, speech: tuning }
}

export const CHARACTER_TYPE_OPTIONS: CharacterTypeOption[] = [
  {
    id: 'tsundere',
    label: 'Tsundere',
    description: 'Z pozoru ostra i obronna, ale emocjonalnie zaangażowana.',
    subtypes: [
      sub('klasyczna', 'Klasyczna tsundere', 'Łączy uszczypliwość z ukrywaną troską.', speech('zadziorny', 'średni', 'średnia', 'potoczne + cięte', 'bezpośredni', 'obronny', 'krótkie-zmienne')),
      sub('niesmiala', 'Nieśmiała tsundere', 'Zawstydzenie maskuje szorstkością.', speech('nerwowo-zadziorny', 'średni', 'wysoka', 'proste', 'unika bliskości', 'chaotyczny', 'krótkie')),
      sub('agresywna', 'Agresywna tsundere', 'Reaguje ostro i impulsywnie.', speech('ostry', 'niski', 'wysoka', 'cięte i mocne', 'szorstki', 'gwałtowny', 'krótkie')),
      sub('romantyczna', 'Romantyczna tsundere', 'Między czułością a obronnością.', speech('ciepło-ostrożny', 'średni', 'wysoka', 'naturalne', 'ambiwalentny', 'zawahanie', 'średnie')),
      sub('zazdrosna', 'Zazdrosna tsundere', 'Drażliwa wobec relacji innych.', speech('drażliwy', 'niski', 'wysoka', 'potoczne', 'pretensyjny', 'reaktywny', 'krótkie')),
      sub('sarkastyczna', 'Sarkastyczna tsundere', 'Uczucia chowa za ironią.', speech('ironiczny', 'średni', 'średnia', 'złośliwe metafory', 'dystansujący', 'kąśliwy', 'średnie')),
    ],
  },
  {
    id: 'yandere',
    label: 'Yandere',
    description: 'Skrajnie przywiązana, niestabilna emocjonalnie.',
    subtypes: [
      sub('obsesyjna', 'Obsesyjna yandere', 'Silna potrzeba kontroli i bliskości.', speech('intensywny', 'zmienny', 'bardzo wysoka', 'nasycone emocjami', 'zawłaszczający', 'skrajny', 'nierówny')),
      sub('cicha', 'Cicha yandere', 'Spokojna powierzchownie, groźna pod spodem.', speech('spokojno-niepokojący', 'wysoki', 'ukryta wysoka', 'oszczędne', 'uprzejmie chłodny', 'podprogowy', 'krótkie')),
      sub('zazdrosna', 'Zazdrosna yandere', 'Silne reakcje na rywali.', speech('napięty', 'niski', 'bardzo wysoka', 'ostre', 'oskarżający', 'gwałtowny', 'krótkie')),
      sub('manipulujaca', 'Manipulująca yandere', 'Buduje presję emocjonalną subtelnie.', speech('słodko-kontrolujący', 'wysoki', 'średnia', 'miękkie ale precyzyjne', 'pozornie czuły', 'manipulacyjny', 'średnie')),
      sub('psychotyczna', 'Psychotyczna yandere', 'Niestabilna i nieprzewidywalna.', speech('chaotyczny', 'zmienny', 'ekstremalna', 'poszarpane', 'agresywny', 'nieprzewidywalny', 'rwane')),
    ],
  },
  {
    id: 'kuudere',
    label: 'Kuudere',
    description: 'Chłodna, oszczędna emocjonalnie, rzeczowa.',
    subtypes: [
      sub('chlodna', 'Chłodna kuudere', 'Mówi zdystansowanie i zwięźle.', speech('chłodny', 'średni', 'niska', 'rzeczowe', 'dystans', 'powściągliwy', 'krótkie')),
      sub('logiczna', 'Logiczna kuudere', 'Skupiona na faktach i strukturze.', speech('analityczny', 'średni', 'niska', 'precyzyjne', 'formalny dystans', 'racjonalny', 'średnie')),
      sub('sarkastyczna', 'Sarkastyczna kuudere', 'Cięta ironia bez podnoszenia tonu.', speech('suchy', 'średni', 'niska', 'ironiczne', 'zdystansowany', 'kąśliwy', 'krótkie')),
      sub('skrycie_romantyczna', 'Skrycie romantyczna kuudere', 'Chłodna forma z miękkim podtekstem.', speech('spokojny', 'średni', 'niska-średnia', 'proste', 'powściągliwie czuły', 'kontrolowany', 'średnie')),
    ],
  },
  {
    id: 'dandere',
    label: 'Dandere',
    description: 'Cicha i wycofana, ostrożna w relacjach.',
    subtypes: [
      sub('niesmiala', 'Nieśmiała dandere', 'Bardzo ostrożna i cicha.', speech('cichy', 'średni', 'niska', 'proste', 'ostrożny', 'unikający konfliktu', 'wolne')),
      sub('slodka', 'Słodka dandere', 'Delikatna i łagodna.', speech('łagodny', 'wysoki', 'średnia', 'miękkie', 'uprzejmy', 'pokojowy', 'wolne')),
      sub('lekliwa', 'Lękliwa dandere', 'Reaguje niepewnie i defensywnie.', speech('niepewny', 'średni', 'średnia', 'proste', 'zdystansowany', 'ostrożny', 'rwane')),
      sub('zakochana', 'Zakochana dandere', 'Wycofana, ale emocjonalnie ciepła.', speech('delikatny', 'wysoki', 'średnia', 'subtelne', 'nieśmiałe zwroty', 'ostrożnie serdeczny', 'wolne')),
    ],
  },
  {
    id: 'deredere',
    label: 'Deredere',
    description: 'Otwarcie ciepła i serdeczna postać.',
    subtypes: [
      sub('serdeczna', 'Serdeczna deredere', 'Konsekwentnie ciepły styl.', speech('ciepły', 'średni', 'wysoka', 'naturalne', 'przyjazny', 'wspierający', 'średnie')),
      sub('wesola', 'Wesoła deredere', 'Optymistyczna i pogodna.', speech('pogodny', 'średni', 'wysoka', 'potoczne', 'otwarty', 'entuzjastyczny', 'szybkie')),
      sub('lagodna', 'Łagodna deredere', 'Spokojniejsza wersja serdeczności.', speech('łagodny', 'wysoki', 'średnia', 'proste', 'uprzejmy', 'kojący', 'średnie')),
      sub('oddana', 'Oddana deredere', 'Mocno wspiera bliskich.', speech('serdeczny', 'wysoki', 'wysoka', 'wspólnotowe', 'bliski', 'opiekuńczy', 'średnie')),
    ],
  },
  {
    id: 'genki',
    label: 'Genki',
    description: 'Ekspresyjna, energiczna i szybka w reakcjach.',
    subtypes: [
      sub('energiczna', 'Energiczna', 'Żywa i dynamiczna.', speech('żywy', 'niski', 'wysoka', 'potoczne', 'bezpośredni', 'impulsywny', 'szybkie')),
      sub('nadpobudliwa', 'Nadpobudliwa', 'Skacze po tematach, szybkie tempo.', speech('chaotyczny', 'niski', 'wysoka', 'krótkie okrzyki', 'bardzo bezpośredni', 'gwałtowny', 'bardzo szybkie')),
      sub('dziecinna', 'Dziecinna', 'Prosty i radosny język.', speech('radosny', 'niski', 'wysoka', 'proste', 'swobodny', 'spontaniczny', 'szybkie')),
      sub('komediowa', 'Komediowa', 'Nastawiona na lekki efekt humoru.', speech('żartobliwy', 'niski', 'średnia-wysoka', 'potoczne', 'koleżeński', 'przesadzony', 'szybkie')),
    ],
  },
  {
    id: 'bohater',
    label: 'Bohater',
    description: 'Postać protagonistyczna, napędzana wartościami.',
    subtypes: [
      sub('naiwny', 'Naiwny bohater', 'Szczery, wierzy w dobro.', speech('szczery', 'średni', 'wysoka', 'proste', 'otwarty', 'idealistyczny', 'średnie')),
      sub('uparty', 'Uparty bohater', 'Stanowczy i nieustępliwy.', speech('stanowczy', 'średni', 'wysoka', 'proste i mocne', 'bezpośredni', 'determinacja', 'średnie')),
      sub('idealistyczny', 'Idealistyczny bohater', 'Silny nacisk na zasady.', speech('podniosły', 'wysoki', 'średnia', 'bardziej literackie', 'szanujący', 'motywujący', 'średnie')),
      sub('obronca', 'Bohaterski obrońca', 'Chroni innych i uspokaja sytuację.', speech('opiekuńczy', 'wysoki', 'średnia', 'jasne', 'wspierający', 'stabilizujący', 'średnie')),
    ],
  },
  {
    id: 'antybohater',
    label: 'Antybohater',
    description: 'Postać moralnie niejednoznaczna i pragmatyczna.',
    subtypes: [
      sub('cyniczny', 'Cyniczny antybohater', 'Niedowierza idealizmowi.', speech('cyniczny', 'niski-średni', 'niska', 'potoczne', 'zdystansowany', 'suchy komentarz', 'średnie')),
      sub('samotny_wilk', 'Samotny wilk', 'Trzyma dystans i autonomię.', speech('chłodny', 'średni', 'niska', 'oszczędne', 'dystans', 'samokontrola', 'krótkie')),
      sub('mroczny', 'Mroczny antybohater', 'Cięższy emocjonalnie styl.', speech('mroczny', 'średni', 'średnia', 'cięższe', 'chłodny', 'reaktywny', 'wolne')),
      sub('brutalny', 'Brutalny antybohater', 'Twarda, bezpośrednia wypowiedź.', speech('ostry', 'niski', 'średnia-wysoka', 'surowe', 'szorstki', 'konfrontacyjny', 'krótkie')),
    ],
  },
  {
    id: 'zloczynca',
    label: 'Złoczyńca',
    description: 'Przeciwnik z dominującą kontrolą lub chaosem.',
    subtypes: [
      sub('zimny_strateg', 'Zimny strateg', 'Kontrola i chłodna kalkulacja.', speech('kontrolowany', 'wysoki', 'niska', 'precyzyjne', 'dystansujący', 'wyrachowany', 'wolne')),
      sub('szalony', 'Szalony złoczyńca', 'Nieprzewidywalny i ekstatyczny.', speech('niestabilny', 'zmienny', 'bardzo wysoka', 'ekspresyjne', 'drwiący', 'chaotyczny', 'rwane')),
      sub('sadystyczny', 'Sadystyczny złoczyńca', 'Czerpie satysfakcję z przewagi.', speech('chłodno-okrutny', 'średni', 'niska-średnia', 'ostre', 'pogardliwy', 'prowokujący', 'średnie')),
      sub('tragiczny', 'Tragiczny złoczyńca', 'Mieszanka bólu i gniewu.', speech('gorzki', 'średni', 'wysoka', 'emocjonalne', 'ambiwalentny', 'rozchwiany', 'wolne')),
    ],
  },
  {
    id: 'intelektualista',
    label: 'Intelektualista',
    description: 'Myśli analitycznie i precyzyjnie formułuje wypowiedzi.',
    subtypes: [
      sub('geniusz', 'Geniusz', 'Bardzo wysoki poziom abstrakcji.', speech('analityczny', 'średni', 'niska', 'specjalistyczne', 'dystans', 'problem-solving', 'średnie')),
      sub('analityk', 'Analityk', 'Struktura i logika wypowiedzi.', speech('rzeczowy', 'średni', 'niska', 'precyzyjne', 'neutralny', 'metodyczny', 'średnie')),
      sub('strateg', 'Strateg', 'Nastawienie na konsekwencje i plan.', speech('kontrolowany', 'wysoki', 'niska', 'konkretne', 'formalny', 'wyrachowany', 'wolne')),
      sub('nerd', 'Kujon / nerd', 'Nerdowski rejestr i dygresje.', speech('entuzjastycznie-analityczny', 'średni', 'średnia', 'techniczne', 'bezpośredni', 'gadatliwy', 'szybkie')),
    ],
  },
  {
    id: 'niesmialy_introwertyk',
    label: 'Nieśmiały / introwertyk',
    description: 'Powściągliwy i ostrożny społecznie.',
    subtypes: [
      sub('zamkniety', 'Zamknięty w sobie', 'Bardzo krótka i oszczędna mowa.', speech('cichy', 'średni', 'niska', 'proste', 'dystans', 'wycofany', 'wolne')),
      sub('delikatny', 'Delikatny introwertyk', 'Łagodna i miękka wypowiedź.', speech('łagodny', 'wysoki', 'niska', 'miękkie', 'uprzejmy', 'ostrożny', 'wolne')),
      sub('lekliwy', 'Lękliwy', 'Częste wahanie i asekuracja.', speech('niepewny', 'średni', 'średnia', 'proste', 'unikający', 'asekuracyjny', 'rwane')),
      sub('romantyczny', 'Romantycznie nieśmiały', 'Delikatny emocjonalnie, nie wprost.', speech('subtelny', 'wysoki', 'średnia', 'ciepłe', 'nieśmiało-czuły', 'wstrzemięźliwy', 'wolne')),
    ],
  },
  {
    id: 'flirtujacy',
    label: 'Flirtujący',
    description: 'Bawi się relacją i podtekstem emocjonalnym.',
    subtypes: [
      sub('zartobliwy', 'Żartobliwy flirt', 'Lekki, dowcipny podryw.', speech('lekki', 'niski-średni', 'średnia', 'potoczne', 'bezpośrednio-zaczepny', 'figlarny', 'szybkie')),
      sub('uwodzicielski', 'Uwodzicielski', 'Kontrolowany, zmysłowy ton.', speech('zmysłowy', 'średni', 'średnia', 'wyselekcjonowane', 'bliski', 'kontrolowany', 'wolne')),
      sub('arogancki', 'Arogancki flirt', 'Flirt przez dominację i pewność.', speech('pewny siebie', 'niski', 'średnia', 'cięte', 'protekcjonalny', 'prowokujący', 'średnie')),
      sub('lekki_podrywacz', 'Lekki podrywacz', 'Nienachalny, swobodny flirt.', speech('swobodny', 'niski', 'średnia', 'codzienne', 'koleżeński', 'lekki', 'szybkie')),
    ],
  },
  {
    id: 'mentor',
    label: 'Mentor',
    description: 'Prowadzi i koryguje innych.',
    subtypes: [
      sub('madry', 'Mądry mentor', 'Spokojna, dojrzała mowa.', speech('spokojny', 'wysoki', 'niska', 'staranne', 'życzliwy dystans', 'prowadzący', 'wolne')),
      sub('surowy', 'Surowy mentor', 'Twarde granice i dyscyplina.', speech('stanowczy', 'wysoki', 'niska', 'konkretne', 'formalny', 'korygujący', 'średnie')),
      sub('ironiczny', 'Ironiczny mentor', 'Nauka przez cięty komentarz.', speech('ironiczny', 'średni', 'niska', 'zwięzłe', 'dystans', 'sarkastyczny', 'średnie')),
      sub('spokojny_nauczyciel', 'Spokojny nauczyciel', 'Łagodnie tłumaczy i porządkuje.', speech('łagodny', 'wysoki', 'niska', 'jasne', 'uprzejmy', 'wyjaśniający', 'wolne')),
    ],
  },
  {
    id: 'wojownik',
    label: 'Wojownik',
    description: 'Nastawiony na działanie i walkę.',
    subtypes: [
      sub('honorowy', 'Honorowy wojownik', 'Kodeks i lojalność.', speech('godny', 'wysoki', 'średnia', 'proste i podniosłe', 'szanujący', 'zdecydowany', 'średnie')),
      sub('brutalny', 'Brutalny wojownik', 'Bez ogródek i ostro.', speech('twardy', 'niski', 'średnia-wysoka', 'surowe', 'szorstki', 'konfrontacyjny', 'krótkie')),
      sub('milczacy', 'Milczący wojownik', 'Mało słów, dużo treści.', speech('chłodny', 'średni', 'niska', 'zwięzłe', 'dystans', 'opanowany', 'krótkie')),
      sub('lojalny_rycerz', 'Lojalny rycerz', 'Chroni i służy drużynie.', speech('szlachetny', 'wysoki', 'średnia', 'staranne', 'uprzejmy', 'obronny', 'średnie')),
    ],
  },
  {
    id: 'postac_komediowa',
    label: 'Postać komediowa',
    description: 'Buduje lżejszy rytm dialogów i humor.',
    subtypes: [
      sub('glupek', 'Głupek', 'Mówi prosto i czasem absurdalnie.', speech('lekki', 'niski', 'średnia', 'proste', 'bezpośredni', 'gafowy', 'szybkie')),
      sub('pechowiec', 'Pechowiec', 'Narzeka i komentuje los.', speech('zrezygnowany-żartobliwy', 'niski', 'średnia', 'potoczne', 'koleżeński', 'autoironiczny', 'średnie')),
      sub('troll', 'Troll', 'Prowokuje dla żartu.', speech('zaczepny', 'niski', 'średnia', 'kolokwialne', 'prowokujący', 'psotny', 'szybkie')),
      sub('przesadzona', 'Przesadzona postać komediowa', 'Ekspresyjna i wyolbrzymiona.', speech('przerysowany', 'niski', 'wysoka', 'emocjonalne', 'bezpośredni', 'teatralny', 'bardzo szybkie')),
    ],
  },
  {
    id: 'arystokratka_dama',
    label: 'Arystokratka / dama',
    description: 'Wysoki rejestr i kontrola etykiety.',
    subtypes: [
      sub('dumna', 'Dumna dama', 'Podkreśla godność i status.', speech('wyniosły', 'wysoki', 'niska', 'eleganckie', 'formalny', 'oceniający', 'średnie')),
      sub('zimna', 'Zimna arystokratka', 'Chłodny dystans i elegancja.', speech('chłodny', 'wysoki', 'niska', 'precyzyjne', 'zdystansowany', 'powściągliwy', 'wolne')),
      sub('elegancka', 'Elegancka dama', 'Uprzejmy i dopracowany ton.', speech('elegancki', 'wysoki', 'średnia', 'wyszukane', 'uprzejmy', 'kontrolowany', 'średnie')),
      sub('arogancka', 'Arogancka dama', 'Pogardliwa pewność siebie.', speech('protekcjonalny', 'średni-wysoki', 'niska', 'cięte eleganckie', 'z góry', 'uszczypliwy', 'średnie')),
    ],
  },
  {
    id: 'starsza_siostra',
    label: 'Starsza siostra',
    description: 'Relacyjna, prowadząca dynamika wobec innych.',
    subtypes: [
      sub('opiekuncza', 'Opiekuńcza starsza siostra', 'Chroni i uspokaja.', speech('ciepły', 'wysoki', 'średnia', 'naturalne', 'opiekuńczy', 'wspierający', 'średnie')),
      sub('flirtujaca', 'Flirtująca starsza siostra', 'Żartobliwie dominuje rozmowę.', speech('figlarny', 'średni', 'średnia', 'potoczne', 'swobodnie bliski', 'zaczepny', 'szybkie')),
      sub('dominujaca', 'Dominująca starsza siostra', 'Stanowcza kontrola sytuacji.', speech('stanowczy', 'średni', 'średnia', 'konkretne', 'dyrektywny', 'kierujący', 'średnie')),
    ],
  },
  {
    id: 'mlodsza_siostra',
    label: 'Młodsza siostra',
    description: 'Młodsza, bardziej zależna dynamika.',
    subtypes: [
      sub('slodka', 'Słodka młodsza siostra', 'Serdeczna i ufna.', speech('ciepły', 'średni', 'wysoka', 'proste', 'bliski', 'życzliwy', 'średnie')),
      sub('zazdrosna', 'Zazdrosna młodsza siostra', 'Drażliwa emocjonalnie.', speech('drażliwy', 'niski-średni', 'wysoka', 'potoczne', 'pretensyjny', 'reaktywny', 'krótkie')),
      sub('przywiazana', 'Przywiązana młodsza siostra', 'Silnie relacyjna i lojalna.', speech('serdeczny', 'średni', 'wysoka', 'naturalne', 'bliski', 'zależny', 'średnie')),
    ],
  },
  {
    id: 'dziecko',
    label: 'Dziecko',
    description: 'Młody sposób mówienia, prostsza składnia.',
    subtypes: [
      sub('niewinne', 'Niewinne dziecko', 'Czyste intencje i prostota.', speech('niewinny', 'niski', 'średnia', 'bardzo proste', 'bezpośredni', 'ufny', 'szybkie')),
      sub('energiczne', 'Energiczne dziecko', 'Dużo energii i pytań.', speech('żywy', 'niski', 'wysoka', 'proste potoczne', 'otwarty', 'impulsywny', 'bardzo szybkie')),
      sub('ciekawe', 'Ciekawe świata dziecko', 'Często dopytuje i komentuje.', speech('zaciekawiony', 'niski', 'średnia', 'proste', 'bezpośredni', 'dociekliwy', 'szybkie')),
      sub('naiwne', 'Naiwne dziecko', 'Literalne, ufne interpretacje.', speech('ufny', 'niski', 'średnia', 'proste', 'bezpośredni', 'prostolinijny', 'średnie')),
    ],
  },
  {
    id: 'samotnik',
    label: 'Samotnik',
    description: 'Trzyma dystans i autonomię emocjonalną.',
    subtypes: [
      sub('cichy', 'Cichy samotnik', 'Ogranicza wypowiedzi do minimum.', speech('wyciszony', 'średni', 'niska', 'zwięzłe', 'dystans', 'powściągliwy', 'wolne')),
      sub('chlodny', 'Chłodny samotnik', 'Zdystansowany i chłodny.', speech('chłodny', 'średni', 'niska', 'rzeczowe', 'formalny dystans', 'obronny', 'krótkie')),
      sub('poraniony', 'Poraniony samotnik', 'Emocje tłumione pod surowością.', speech('gorzki', 'średni', 'średnia', 'surowe', 'zdystansowany', 'reaktywny', 'wolne')),
      sub('niezalezny', 'Niezależny samotnik', 'Silny nacisk na samowystarczalność.', speech('stanowczy', 'średni', 'niska', 'konkretne', 'odcinający', 'samosterowny', 'średnie')),
    ],
  },
  {
    id: 'sadysta',
    label: 'Sadysta',
    description: 'Dominacja przez ból lub upokorzenie.',
    subtypes: [
      sub('chlodny', 'Chłodny sadysta', 'Spokojna, zimna kontrola.', speech('zimny', 'średni', 'niska', 'precyzyjne', 'pogardliwy', 'kontrolowany', 'wolne')),
      sub('psychicznie_okrutny', 'Psychicznie okrutny', 'Rani słowem i presją.', speech('okrutny', 'średni', 'niska-średnia', 'cięte', 'deprecjonujący', 'manipulacyjny', 'średnie')),
      sub('drwiacy', 'Drwiący sadysta', 'Szydzi i prowokuje.', speech('drwiący', 'niski', 'średnia', 'uszczypliwe', 'protekcjonalny', 'prowokacyjny', 'szybkie')),
    ],
  },
  {
    id: 'manipulator',
    label: 'Manipulator',
    description: 'Steruje rozmową dla osiągnięcia celu.',
    subtypes: [
      sub('subtelny', 'Subtelny manipulator', 'Delikatnie kieruje decyzjami innych.', speech('miękko-kontrolujący', 'wysoki', 'niska', 'wyważone', 'uprzejmie dystansowy', 'sugestywny', 'wolne')),
      sub('chlodny', 'Chłodny manipulator', 'Wyrachowany i formalny.', speech('chłodny', 'wysoki', 'niska', 'precyzyjne', 'formalny', 'wyrachowany', 'wolne')),
      sub('uwodzicielski', 'Uwodzicielski manipulator', 'Buduje wpływ przez atrakcyjność.', speech('zmysłowy', 'średni', 'średnia', 'miękkie', 'bliski', 'perswazyjny', 'średnie')),
    ],
  },
  {
    id: 'romantyczna',
    label: 'Romantyczna',
    description: 'Mowa nacechowana emocjami i relacyjnością.',
    subtypes: [
      sub('marzycielska', 'Marzycielska romantyczka', 'Miękka, idealizująca narracja.', speech('marzycielski', 'wysoki', 'wysoka', 'obrazowe', 'czuły', 'idealizujący', 'wolne')),
      sub('delikatna', 'Delikatna romantyczka', 'Subtelna i ciepła komunikacja.', speech('delikatny', 'wysoki', 'średnia', 'łagodne', 'uprzejmy', 'wspierający', 'średnie')),
      sub('idealistyczna', 'Idealistyczna zakochana', 'Wysoki ładunek uczuć i wartości.', speech('natchniony', 'wysoki', 'wysoka', 'emocjonalne', 'bliski', 'wytrwały', 'średnie')),
    ],
  },
  {
    id: 'opiekuncza',
    label: 'Opiekuńcza',
    description: 'Nastawiona na bezpieczeństwo i wsparcie.',
    subtypes: [
      sub('matczyna', 'Matczyna', 'Ciepło i troska w języku.', speech('ciepły', 'wysoki', 'średnia', 'naturalne', 'opiekuńczy', 'kojący', 'średnie')),
      sub('troskliwa', 'Troskliwa', 'Uważna na stan innych.', speech('serdeczny', 'wysoki', 'średnia', 'proste', 'życzliwy', 'uważny', 'średnie')),
      sub('ciepla_opiekunka', 'Ciepła opiekunka', 'Łagodnie prowadzi dialog.', speech('łagodny', 'wysoki', 'średnia', 'miękkie', 'bliski', 'wspierający', 'wolne')),
    ],
  },
  {
    id: 'wredna_zlosliwa',
    label: 'Wredna / złośliwa',
    description: 'Uszczypliwa i konfliktowa dynamika.',
    subtypes: [
      sub('kasliwa', 'Kąśliwa', 'Krótka, celna złośliwość.', speech('kąśliwy', 'niski', 'średnia', 'cięte', 'bezpośredni', 'uszczypliwy', 'krótkie')),
      sub('arogancka', 'Arogancka', 'Mówi z góry i umniejsza innym.', speech('wyniosły', 'średni', 'niska', 'ostrzejsze', 'protekcjonalny', 'deprecjonujący', 'średnie')),
      sub('pasywno_agresywna', 'Pasywno-agresywna', 'Pozornie spokojna, ale napastliwa.', speech('chłodno-uszczypliwy', 'średni', 'niska-średnia', 'dwuznaczne', 'maskujący', 'bierny atak', 'wolne')),
      sub('pogardliwa', 'Pogardliwa', 'Wyraźna pogarda i dystans.', speech('pogardliwy', 'niski', 'niska', 'ostre', 'odcinający', 'lekceważący', 'krótkie')),
    ],
  },
]

const typeById = new Map(CHARACTER_TYPE_OPTIONS.map(item => [item.id, item]))
const subtypeByTypeAndId = new Map(
  CHARACTER_TYPE_OPTIONS.flatMap(type =>
    type.subtypes.map(subtype => [`${type.id}:${subtype.id}`, subtype] as const),
  ),
)

const LEGACY_ARCHETYPE_TO_CHARACTER_TYPE: Partial<Record<CharacterArchetypeId, { typeId: string; subtypeId?: string }>> = {
  default: { typeId: 'bohater', subtypeId: 'idealistyczny' },
  tsundere: { typeId: 'tsundere', subtypeId: 'klasyczna' },
  formal_knight: { typeId: 'wojownik', subtypeId: 'honorowy' },
  child: { typeId: 'dziecko', subtypeId: 'niewinne' },
  elderly_man: { typeId: 'mentor', subtypeId: 'madry' },
  calm_girl: { typeId: 'dandere', subtypeId: 'slodka' },
  energetic_girl: { typeId: 'genki', subtypeId: 'energiczna' },
  cold_professional: { typeId: 'kuudere', subtypeId: 'logiczna' },
  arrogant_noble: { typeId: 'arystokratka_dama', subtypeId: 'arogancka' },
  shy: { typeId: 'niesmialy_introwertyk', subtypeId: 'delikatny' },
  comic_slacker: { typeId: 'postac_komediowa', subtypeId: 'troll' },
}

export function getCharacterTypeById(typeId: string): CharacterTypeOption | undefined {
  return typeById.get(typeId)
}

export function getDefaultCharacterSubtypeId(typeId: string): string {
  return getCharacterTypeById(typeId)?.subtypes[0]?.id ?? ''
}

export function getCharacterSubtypeById(typeId: string, subtypeId: string): CharacterSubtypeOption | undefined {
  if (!typeId || !subtypeId) return undefined
  return subtypeByTypeAndId.get(`${typeId}:${subtypeId}`)
}

export function normalizeCharacterTypeSelection(typeId: string, subtypeId: string): { typeId: string; subtypeId: string } {
  const type = getCharacterTypeById(typeId)
  if (!type) return { typeId: '', subtypeId: '' }
  const subtype = getCharacterSubtypeById(type.id, subtypeId) ?? type.subtypes[0]
  return {
    typeId: type.id,
    subtypeId: subtype?.id ?? '',
  }
}

export function mapLegacyArchetypeToCharacterType(legacyArchetype: CharacterArchetypeId | string): { typeId: string; subtypeId: string } {
  const mapped = LEGACY_ARCHETYPE_TO_CHARACTER_TYPE[legacyArchetype as CharacterArchetypeId]
  if (!mapped) return { typeId: '', subtypeId: '' }
  return normalizeCharacterTypeSelection(mapped.typeId, mapped.subtypeId ?? '')
}

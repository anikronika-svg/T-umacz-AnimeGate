function preserveCaseLike(source, replacement) {
  if (!source) return replacement;
  if (source[0] === source[0].toUpperCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

function applyWordReplacements(text, replacements) {
  let next = text;
  replacements.forEach(([pattern, replacement]) => {
    next = next.replace(pattern, match => preserveCaseLike(match, replacement));
  });
  return next;
}

function normalizePolishForStyleMatch(value) {
  return value
    .trim()
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/\s+/g, ' ');
}

function applyWholeLineStyleRewrite(text, rewrites) {
  const normalized = normalizePolishForStyleMatch(text);
  for (const [pattern, replacement] of rewrites) {
    if (pattern.test(normalized)) return replacement;
  }
  return text;
}

const ARCHETYPE_WORD_REPLACEMENTS = {
  default: [],
  tsundere: [
    [/^oh,\s*tino\.\s*idziesz na zakupy\?$/giu, 'No, Tino. Idziesz na zakupy?'],
    [/^mama jest dziś zajęta,\s*więc pomagam\.$/giu, 'Mama jest dziś zajęta, więc pomagam, i tyle.'],
    [/^uważaj,\s*aby nie zostać zbyt późno\.$/giu, 'Uważaj, żeby nie wrócić za późno.'],
    [/^takich,\s*którzy nie wahają się popełniać przestępstw\.$/giu, 'Takich, co bez wahania popełniają przestępstwa.'],
    [/^po zakończeniu zakupów,\s*upewnij się,\s*że przychodzisz prosto\s*[-—]?$/giu, 'Po zakupach wróć prosto, dobra?'],
    [/^\s*dziękuję,\s*/giu, 'Tch... dzięki, '],
    [/\bdzieki\b/giu, 'dobra, dzięki'],
    [/dziękuję/giu, 'dzięki'],
    [/nie martw(?:\s+si(?:e|ę))/giu, 'spokojnie, poradzę sobie'],
    [/rozumiem,\s*ale/giu, 'wiem, ale...'],
    [/\baby\b/giu, 'żeby'],
    [/(?<![\p{L}\p{N}])spoko(?![\p{L}\p{N}])/giu, 'no jasne'],
    [/(?<![\p{L}\p{N}])ok(?![\p{L}\p{N}])/giu, 'dobra'],
  ],
  formal_knight: [
    [/^oh,\s*tino\.\s*idziesz na zakupy\?$/giu, 'Och, Tino. Czy wybierasz się na zakupy?'],
    [/^mama jest dziś zajęta,\s*więc pomagam\.$/giu, 'Matka jest dziś zajęta, zatem służę pomocą.'],
    [/^uważaj,\s*aby nie zostać zbyt późno\.$/giu, 'Proszę uważać, aby nie wrócić zbyt późno.'],
    [/^takich,\s*którzy nie wahają się popełniać przestępstw\.$/giu, 'Takich, którzy bez wahania popełniają czyny przestępcze.'],
    [/^po zakończeniu zakupów,\s*upewnij się,\s*że przychodzisz prosto\s*[-—]?$/giu, 'Po zakończeniu zakupów proszę wrócić bez zbędnej zwłoki.'],
    [/^\s*dziękuję,\s*/giu, 'Dziękuję uprzejmie, '],
    [/nie martw(?:\s+si(?:e|ę))/giu, 'proszę się nie obawiać'],
    [/ogarniemy ich/giu, 'zajmiemy się nimi'],
    [/ogarniemy/giu, 'zajmiemy się tym'],
    [/(?<![\p{L}\p{N}])spoko(?![\p{L}\p{N}])/giu, 'w porządku'],
    [/(?<![\p{L}\p{N}])ale(?![\p{L}\p{N}])/giu, 'jednak'],
    [/zrobię/giu, 'wykonam'],
    [/teraz/giu, 'niezwłocznie'],
    [/(?<![\p{L}\p{N}])ok(?![\p{L}\p{N}])/giu, 'dobrze'],
  ],
  child: [
    [/^oh,\s*tino\.\s*idziesz na zakupy\?$/giu, 'Hej, Tino, idziesz na zakupy?'],
    [/^mama jest dziś zajęta,\s*więc pomagam\.$/giu, 'Mama jest dziś zajęta, więc jej pomagam.'],
    [/^uważaj,\s*aby nie zostać zbyt późno\.$/giu, 'Uważaj, żeby nie wracać za późno.'],
    [/^takich,\s*którzy nie wahają się popełniać przestępstw\.$/giu, 'Takich, co robią złe rzeczy bez zastanowienia.'],
    [/^po zakończeniu zakupów,\s*upewnij się,\s*że przychodzisz prosto\s*[-—]?$/giu, 'Po zakupach wróć od razu, dobrze?'],
    [/nie martw(?:\s+si(?:e|ę))/giu, 'nie bój się'],
    [/przez przypadek/giu, 'niechcący'],
    [/nieumyślnie/giu, 'niechcący'],
    [/rozumiem,\s*ale/giu, 'aha, ale'],
    [/^\s*dziękuję,\s*/giu, 'Dzięki, '],
    [/\baby\b/giu, 'żeby'],
    [/którzy/giu, 'co'],
    [/(?<![\p{L}\p{N}])spoko(?![\p{L}\p{N}])/giu, 'dobra'],
    [/w porządku/giu, 'okej'],
  ],
  elderly_man: [
    [/^oh,\s*tino\.\s*idziesz na zakupy\?$/giu, 'Och, Tino, wybierasz się na zakupy?'],
    [/^mama jest dziś zajęta,\s*więc pomagam\.$/giu, 'Mama jest dziś zajęta, więc trzeba jej pomóc.'],
    [/^uważaj,\s*aby nie zostać zbyt późno\.$/giu, 'Uważaj, żeby nie wracać zbyt późno.'],
    [/^takich,\s*którzy nie wahają się popełniać przestępstw\.$/giu, 'Takich, którzy bez wahania dopuszczają się przestępstw.'],
    [/^po zakończeniu zakupów,\s*upewnij się,\s*że przychodzisz prosto\s*[-—]?$/giu, 'Po zakupach wróć prosto do domu, dobrze?'],
    [/^\s*dziękuję,\s*/giu, 'Dziękuję ci, '],
    [/(?<![\p{L}\p{N}])spoko(?![\p{L}\p{N}])/giu, 'spokojnie'],
    [/(?<![\p{L}\p{N}])ok(?![\p{L}\p{N}])/giu, 'dobrze'],
    [/ogarniemy ich/giu, 'zajmiemy się nimi'],
    [/nie martw(?:\s+si(?:e|ę))/giu, 'spokojnie, wszystko się ułoży'],
    [/\baby\b/giu, 'żeby'],
    [/teraz/giu, 'od razu'],
  ],
};

const ARCHETYPE_SHORT_LINE_REWRITES = {
  default: [],
  tsundere: [
    [/^dziekuje[.!?]*$/giu, 'Tch... dzięki.'],
    [/^rozumiem[.!?]*$/giu, 'Wiem.'],
  ],
  formal_knight: [
    [/^dzieki[.!?]*$/giu, 'Dziękuję uprzejmie.'],
    [/^spoko[.!?]*$/giu, 'W porządku.'],
    [/^ok,\s*jesli trzeba,\s*zrobie to teraz[.!?]*$/giu, 'Dobrze. Jeśli zajdzie potrzeba, wykonam to niezwłocznie.'],
  ],
  child: [
    [/^dziekuje[.!?]*$/giu, 'Dzięki!'],
    [/^rozumiem[.!?]*$/giu, 'Aha!'],
    [/^ok,\s*jesli trzeba,\s*zrobie to teraz[.!?]*$/giu, 'Dobra, jak trzeba, zrobię to teraz!'],
  ],
  elderly_man: [
    [/^spoko[.!?]*$/giu, 'Spokojnie.'],
    [/^ok[.!?]*$/giu, 'Dobrze.'],
    [/^ok,\s*jesli trzeba,\s*zrobie to teraz[.!?]*$/giu, 'Dobrze, jeśli trzeba, zrobię to od razu.'],
  ],
};

function applyArchetypeLocally(text, archetype, speakingTraits = '') {
  const shortRewrites = ARCHETYPE_SHORT_LINE_REWRITES[archetype] ?? [];
  const wordReplacements = ARCHETYPE_WORD_REPLACEMENTS[archetype] ?? [];
  const withShort = applyWholeLineStyleRewrite(text, shortRewrites);
  let next = applyWordReplacements(withShort, wordReplacements);

  const traits = normalizePolishForStyleMatch(speakingTraits);
  if (traits.includes('zadzior') && !/!/u.test(next)) next = `${next}!`;
  if (traits.includes('spokoj') && /!/u.test(next)) next = next.replace(/!+/gu, '.');
  if (traits.includes('nieśmia') || traits.includes('niesmia')) {
    if (!/[.?!]$/u.test(next)) next = `${next}...`;
    else next = next.replace(/[.?!]+$/u, '...');
  }

  return next;
}

const realProjectLines = [
  'Oh, Tino. Idziesz na zakupy?',
  'Mama jest dziś zajęta, więc pomagam.',
  'Uważaj, aby nie zostać zbyt późno.',
  'Takich, którzy nie wahają się popełniać przestępstw.',
  'Po zakończeniu zakupów, upewnij się, że przychodzisz prosto -',
];

const archetypes = [
  { id: 'default', label: 'Domyślny' },
  { id: 'tsundere', label: 'Tsundere' },
  { id: 'formal_knight', label: 'Formalny rycerz' },
  { id: 'child', label: 'Dziecko' },
  { id: 'elderly_man', label: 'Starszy pan' },
];

for (const line of realProjectLines) {
  console.log(`\nSOURCE: ${line}`);
  for (const archetype of archetypes) {
    const output = applyArchetypeLocally(line, archetype.id);
    console.log(`- ${archetype.label}: ${output}`);
  }
}

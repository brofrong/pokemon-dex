/**
 * Static UI copy: every label, button, section title and templated phrase that is not a
 * Pokémon/ability/item/etc. name looked up from the generated data (see `names.ts` for those).
 *
 * `UI_EN` is the source of truth: `UiKey` is derived from its keys, so `UI_RU` must supply a
 * Russian string for every one of them, or TypeScript fails the build (a missing `ru` key is a
 * compile error, not a runtime fallback).
 *
 * Keys are flat, dot-namespaced strings (`"evo.level"`, `"stat.hp"`, …) rather than nested
 * objects, matching how they are referenced throughout the app and the task brief.
 */

export type Lang = "en" | "ru";
export const LANGS: Lang[] = ["en", "ru"];

/** English copy — the source of truth for which keys exist. */
export const UI_EN = {
  // Header / generation switcher
  "gen.label": "Gen {roman}",
  "gen.soon": "soon",
  "lang.en": "EN",
  "lang.ru": "RU",

  // Search
  "search.placeholder": 'Find a Pokémon: name or number, e.g. "pika" or 25',
  "search.label": "Search Pokémon by name or number",
  "search.hotkey": "⌘K",

  // List page meta / empty state
  "meta.listTitle": "Pokédex — {gen}",
  "list.empty": "No Pokémon match your search.",

  // ⌘K command palette
  "palette.placeholder": "Search Pokémon…",
  "palette.empty": "No results",
  "palette.hint": "↑↓ to navigate · Enter to open · Esc to close",
  "palette.offline": "Search unavailable offline — try again shortly.",

  // Filters
  "filters.type": "Type",
  "filters.special": "Special",
  "filters.sort": "Sort",
  "sort.number": "No.",
  "sort.name": "Name",
  "sort.asc": "Ascending",
  "sort.desc": "Descending",

  // Chips
  "chip.legendary": "★ Legendary",
  "chip.mythical": "✦ Mythical",
  "chip.baby": "Baby",
  "chip.unovaOnly": "Unova only",
  "chip.shiny": "✦ Shiny",

  // Card flags (short form shown on the card itself)
  "flag.legendary": "★ Legendary",
  "flag.mythical": "✦ Mythical",
  "flag.baby": "Baby",
  "flag.new": "New",

  // Navigation / crumbs
  "nav.all": "All Pokémon",
  "nav.allShort": "All",

  // Hero / detail page
  "meta.height": "Height",
  "meta.weight": "Weight",
  "meta.gender": "Gender",
  "meta.egg": "Egg",
  "meta.genderless": "Genderless",
  "ability.hidden": "hidden",

  // Variant toggles
  "variant.normal": "Normal",
  "variant.shiny": "✦ Shiny",
  "variant.front": "Front",
  "variant.back": "Back",
  "variant.male": "♂ Male",
  "variant.female": "♀ Female",

  // Section titles
  "section.stats": "Base stats",
  "section.abilities": "Abilities",
  "section.damageTo": "Damage taken",
  "section.evolution": "Evolution",
  "section.pokedex": "Pokédex",
  "section.breeding": "Breeding",

  // Stat names, in game order
  "stat.hp": "HP",
  "stat.attack": "Attack",
  "stat.defense": "Defense",
  "stat.spAttack": "Sp. Atk",
  "stat.spDefense": "Sp. Def",
  "stat.speed": "Speed",
  "stat.total": "Total",

  // Breeding box key/value labels
  "kv.eggGroups": "Egg groups",
  "kv.eggCycles": "Egg cycles",
  "kv.catchRate": "Catch rate",

  // Theme
  "theme.auto": "Auto",
  "theme.light": "Light",
  "theme.dark": "Dark",

  // Footer
  "footer.disclaimer":
    "Pokémon and Pokémon character names are trademarks of Nintendo. This is an unofficial, non-commercial fan site, not affiliated with Nintendo, Game Freak or The Pokémon Company.",
  "footer.dataCredit": "Data from PokeAPI.",
  "footer.iconsCredit": "Type icons by pokemon-type-icons (MIT license).",

  // Evolution condition phrases (used by formatCondition, Task 11)
  "evo.level": "Lvl. {level}",
  "evo.item": "{item}",
  "evo.happiness": "Friendship",
  "evo.happinessDay": "Friendship, daytime",
  "evo.happinessNight": "Friendship, nighttime",
  "evo.trade": "Trade",
  "evo.tradeItem": "Trade holding {item}",
  "evo.tradeSpecies": "Trade for “{species}”",
  "evo.knownMove": "Knows “{move}”",
  "evo.knownMoveType": "Knows a {type}-type move",
  "evo.location": "Lvl. up at “{location}”",
  "evo.gender.female": "females only",
  "evo.gender.male": "males only",
  "evo.stats.gt": "Attack > Defense",
  "evo.stats.eq": "Attack = Defense",
  "evo.stats.lt": "Attack < Defense",
  "evo.party": "“{species}” in party",
  "evo.beauty": "Beauty {beauty}+",
  "evo.shed": "Empty party slot + spare Poké Ball",
  "evo.other": "Special condition",
  "evo.needsRain": "Lvl. up in rain",
  "evo.upsideDown": "Lvl. up, system upside down",
  "evo.partyType": "{type}-type Pokémon in party",
  "evo.minAffection": "Affection {affection}+",
  "evo.nature.amped": "Amped nature",
  "evo.nature.lowKey": "Low Key nature",
  "evo.minDamageTaken": "{damage} HP damage taken",
  "evo.needsMultiplayer": "Lvl. up, connected online",
  // evo.usedMove and evo.minSteps live in COUNT_EN/COUNT_RU instead (see below): both need a
  // grammatically correct Russian plural for the count they carry, which a flat UiKey can't do.

  // Pokédex flavor-text source label (Task 5a: other generations' ru text is Pokémon GO's
  // official description, shown with this label rather than claimed as that game's own text).
  "flavor.sourceGo": "Pokémon GO",

  // Custom 404 page (GitHub Pages serves dist/404.html for any unknown path under the base).
  // Rendered in English by default (the route carries no {lang} segment); both languages'
  // message are shown side by side, see src/pages/404.astro.
  "notFound.title": "Page not found",
  "notFound.message": "This page doesn’t exist.",
  "notFound.cta": "Go to the Pokédex",
} as const;

/** Every valid key for {@link t}, derived from {@link UI_EN} so a missing `ru` entry is a type error. */
export type UiKey = keyof typeof UI_EN;

/** Russian copy. Must cover every {@link UiKey}; TypeScript enforces this at compile time. */
export const UI_RU: Record<UiKey, string> = {
  "gen.label": "Поколение {roman}",
  "gen.soon": "скоро",
  "lang.en": "EN",
  "lang.ru": "RU",

  "search.placeholder": "Найти покемона: имя или номер, например «пика» или 25",
  "search.label": "Поиск покемона по имени или номеру",
  "search.hotkey": "⌘K",

  "meta.listTitle": "Покедекс — {gen}",
  "list.empty": "Ничего не найдено по вашему запросу.",

  "palette.placeholder": "Поиск покемона…",
  "palette.empty": "Ничего не найдено",
  "palette.hint": "↑↓ выбрать · Enter открыть · Esc закрыть",
  "palette.offline": "Поиск недоступен офлайн — попробуйте позже",

  "filters.type": "Тип",
  "filters.special": "Особые",
  "filters.sort": "Сортировка",
  "sort.number": "№",
  "sort.name": "Имя",
  "sort.asc": "По возрастанию",
  "sort.desc": "По убыванию",

  "chip.legendary": "★ Легендарные",
  "chip.mythical": "✦ Мифические",
  "chip.baby": "Малыши",
  "chip.unovaOnly": "Только Unova",
  "chip.shiny": "✦ Shiny",

  "flag.legendary": "★ Легенда",
  "flag.mythical": "✦ Миф",
  "flag.baby": "Малыш",
  "flag.new": "Unova",

  "nav.all": "Все покемоны",
  "nav.allShort": "Все",

  "meta.height": "Рост",
  "meta.weight": "Вес",
  "meta.gender": "Пол",
  "meta.egg": "Яйцо",
  "meta.genderless": "Без пола",
  "ability.hidden": "скрытая",

  "variant.normal": "Обычный",
  "variant.shiny": "✦ Shiny",
  "variant.front": "Спереди",
  "variant.back": "Сзади",
  "variant.male": "♂ Самец",
  "variant.female": "♀ Самка",

  "section.stats": "Базовые статы",
  "section.abilities": "Способности",
  "section.damageTo": "Урон по этому покемону",
  "section.evolution": "Эволюция",
  "section.pokedex": "Покедекс",
  "section.breeding": "Разведение",

  "stat.hp": "HP",
  "stat.attack": "Атака",
  "stat.defense": "Защита",
  "stat.spAttack": "Сп. атака",
  "stat.spDefense": "Сп. защита",
  "stat.speed": "Скорость",
  "stat.total": "Сумма",

  "kv.eggGroups": "Яйцевые группы",
  "kv.eggCycles": "Циклы яйца",
  "kv.catchRate": "Шанс поимки",

  "theme.auto": "Авто",
  "theme.light": "Светлая",
  "theme.dark": "Тёмная",

  "footer.disclaimer":
    "Pokémon и имена персонажей Pokémon — товарные знаки Nintendo. Этот сайт — некоммерческий фан-проект, не связанный с Nintendo, Game Freak или The Pokémon Company.",
  "footer.dataCredit": "Данные предоставлены PokeAPI.",
  "footer.iconsCredit": "Иконки типов — pokemon-type-icons (лицензия MIT).",

  "evo.level": "Ур. {level}",
  "evo.item": "{item}",
  "evo.happiness": "Дружба",
  "evo.happinessDay": "Дружба, днём",
  "evo.happinessNight": "Дружба, ночью",
  "evo.trade": "Обмен",
  "evo.tradeItem": "Обмен с предметом «{item}»",
  "evo.tradeSpecies": "Обмен на «{species}»",
  "evo.knownMove": "Знает приём «{move}»",
  "evo.knownMoveType": "Знает приём (тип: {type})",
  "evo.location": "Ур. в локации «{location}»",
  "evo.gender.female": "только самки",
  "evo.gender.male": "только самцы",
  "evo.stats.gt": "Атака > Защита",
  "evo.stats.eq": "Атака = Защита",
  "evo.stats.lt": "Атака < Защита",
  "evo.party": "в команде есть «{species}»",
  "evo.beauty": "Красота {beauty}+",
  "evo.shed": "Свободное место в команде и запасной Покебол",
  "evo.other": "Особое условие",
  "evo.needsRain": "Ур. под дождём",
  "evo.upsideDown": "Ур. вверх ногами",
  "evo.partyType": "в команде есть Покемон типа «{type}»",
  "evo.minAffection": "Привязанность {affection}+",
  "evo.nature.amped": "Характер «Бодрый»",
  "evo.nature.lowKey": "Характер «Спокойный»",
  "evo.minDamageTaken": "Получено {damage} ед. урона",
  "evo.needsMultiplayer": "Ур. в сетевом режиме",

  "flavor.sourceGo": "Pokémon GO",

  "notFound.title": "Страница не найдена",
  "notFound.message": "Такой страницы не существует.",
  "notFound.cta": "Перейти в Покедекс",
};

const DICTS: Record<Lang, Record<UiKey, string>> = { en: UI_EN, ru: UI_RU };

/**
 * Looks up `key` in the dictionary for `lang` and substitutes any `{name}` placeholders from
 * `vars`. There is no runtime fallback here: `UI_RU`'s type already guarantees every key exists
 * in both languages.
 */
export function t(
  lang: Lang,
  key: UiKey,
  vars?: Record<string, string | number>,
): string {
  let str = DICTS[lang][key];
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.replaceAll(`{${name}}`, String(value));
    }
  }
  return str;
}

/**
 * Picks the grammatically correct Russian plural form for a count, e.g.
 * `pluralRu(n, ["покемон", "покемона", "покемонов"])`. `forms` is `[one, few, many]`
 * (1 / 2–4 / 0, 5–20 — standard Russian plural rules). English has no such distinction, so
 * callers only need this for `lang === 'ru'`.
 */
export function pluralRu(
  n: number,
  forms: [one: string, few: string, many: string],
): string {
  const mod10 = n % 10;
  const mod100 = n % 100;
  if (mod10 === 1 && mod100 !== 11) return forms[0];
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 10 || mod100 >= 20))
    return forms[1];
  return forms[2];
}

/**
 * Count-bearing UI strings, kept out of `UI_EN`/`UI_RU` because they need a different number of
 * plural forms per language: English only distinguishes "one" (`1 Pokémon`) from "other"
 * (`0, 2, 3, … Pokémon`), while Russian needs three (`one`/`few`/`many`, see {@link pluralRu}).
 * Forcing both languages through the same flat `Record<UiKey, string>` would mean either losing
 * Russian's distinction or inventing fake English plural forms, so these live in their own small
 * dictionaries and are rendered through {@link tCount} instead of {@link t}.
 */
export const COUNT_EN = {
  "list.count": {
    one: "{count} Pokémon · search and filters apply instantly, no waiting",
    other: "{count} Pokémon · search and filters apply instantly, no waiting",
  },
  // "×" reads the same regardless of count, so English doesn't actually need a one/other split
  // here -- both forms are identical. Still goes through COUNT_EN/tCount (rather than UI_EN/t)
  // so the en/ru pair stays symmetric, since ru genuinely needs three forms for this one.
  "evo.usedMove": {
    one: "Used “{move}” {count}×",
    other: "Used “{move}” {count}×",
  },
  "evo.minSteps": {
    one: "{count} step together",
    other: "{count} steps together",
  },
} as const;

/** Every valid key for {@link tCount}, derived from {@link COUNT_EN}. */
export type CountKey = keyof typeof COUNT_EN;

/** Russian plural forms for every {@link CountKey}; must cover every key `COUNT_EN` defines. */
export const COUNT_RU: Record<
  CountKey,
  { one: string; few: string; many: string }
> = {
  "list.count": {
    one: "{count} покемон · поиск и фильтры срабатывают сразу, без ожидания",
    few: "{count} покемона · поиск и фильтры срабатывают сразу, без ожидания",
    many: "{count} покемонов · поиск и фильтры срабатывают сразу, без ожидания",
  },
  "evo.usedMove": {
    one: "Использовал приём «{move}» {count} раз",
    few: "Использовал приём «{move}» {count} раза",
    many: "Использовал приём «{move}» {count} раз",
  },
  "evo.minSteps": {
    one: "{count} шаг вместе",
    few: "{count} шага вместе",
    many: "{count} шагов вместе",
  },
};

/**
 * Renders a count-bearing string for `count` in `lang`, picking the grammatically correct
 * plural form (English: one/other; Russian: one/few/many via {@link pluralRu}), substituting
 * `{count}`, and then any other `{name}` placeholders from `vars` (e.g. `evo.usedMove`'s
 * `{move}`, which isn't itself pluralized).
 */
export function tCount(
  lang: Lang,
  key: CountKey,
  count: number,
  vars?: Record<string, string | number>,
): string {
  const template =
    lang === "en"
      ? count === 1
        ? COUNT_EN[key].one
        : COUNT_EN[key].other
      : pluralRu(count, [
          COUNT_RU[key].one,
          COUNT_RU[key].few,
          COUNT_RU[key].many,
        ]);
  let str = template.replaceAll("{count}", String(count));
  if (vars) {
    for (const [name, value] of Object.entries(vars)) {
      str = str.replaceAll(`{${name}}`, String(value));
    }
  }
  return str;
}

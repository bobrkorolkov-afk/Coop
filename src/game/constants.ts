// ============ БЭДТРИП — константы: герои, карты, тюнинг ============

export interface WeaponDef {
  name: string;
  damage: number;
  fireRate: number; // выстрелов в секунду
  mag: number;
  reloadTime: number;
  spread: number; // радианы
  range: number;
  auto: boolean;
  pellets?: number;
  healAlly?: number;
  slow?: number;
  bleed?: number;
}

export interface AbilityDef {
  name: string;
  cd: number;
  desc: string;
}

export interface HeroDef {
  id: string;
  name: string;
  emoji: string;
  role: string;
  desc: string;
  hp: number;
  speed: number; // множитель к базовой скорости
  jump: number;
  color: number;
  weapon: WeaponDef;
  q: AbilityDef;
  e: AbilityDef;
  ult: { name: string; cost: number; desc: string };
}

export const HEROES: HeroDef[] = [
  {
    id: 'shilo',
    name: 'ШИЛО',
    emoji: '⚡',
    role: 'Дуэлянт / DPS',
    desc: 'Скорый панк с гвоздодёром. Быстрее своей тени, глупее своих ног.',
    hp: 100,
    speed: 1.2,
    jump: 1.0,
    color: 0xb6ff00,
    weapon: {
      name: 'Гвоздодёр', damage: 14, fireRate: 6.5, mag: 14, reloadTime: 1.1,
      spread: 0.012, range: 80, auto: true, bleed: 3,
    },
    q: { name: 'Рывок', cd: 4, desc: 'Рывок вперёд, следующий выстрел — крит ×2' },
    e: { name: 'Шило-град', cd: 10, desc: 'Веер из 7 гвоздей + кровотечение' },
    ult: { name: 'БЫСТРЕЕ МЫСЛИ', cost: 100, desc: '6 с: ×2 скорость и темп, убийства продлевают' },
  },
  {
    id: 'spora',
    name: 'СПОРА',
    emoji: '🍄',
    role: 'Саппорт / Контроллер',
    desc: 'Грибной сектант. Уверен, что вы уже в его плане.',
    hp: 110,
    speed: 0.9,
    jump: 1.2,
    color: 0x7a00ff,
    weapon: {
      name: 'Споромёт', damage: 9, fireRate: 1.6, mag: 6, reloadTime: 1.6,
      spread: 0.09, range: 26, auto: true, pellets: 6, healAlly: 8,
    },
    q: { name: 'Лечебный пшик', cd: 8, desc: 'Облако спор: лечит своих, слепит чужих' },
    e: { name: 'Мицелий', cd: 12, desc: 'Грибная стена на 6 с (разрушаема)' },
    ult: { name: 'БЭД ТРИП', cost: 100, desc: 'Враги рядом: инверсия управления 3 с + яд' },
  },
  {
    id: 'golosa',
    name: 'ГОЛОСА',
    emoji: '📻',
    role: 'Трикстер / Контроллер',
    desc: 'Шизофреник. Голоса у него в голове теперь с нанесением урона.',
    hp: 90,
    speed: 1.0,
    jump: 1.0,
    color: 0xff2bd6,
    weapon: {
      name: 'Радио-волна', damage: 11, fireRate: 4, mag: 20, reloadTime: 1.3,
      spread: 0.02, range: 60, auto: true,
    },
    q: { name: 'Двойник', cd: 10, desc: 'Клон-галлюцинация: стреляющие по нему светятся' },
    e: { name: 'Стук', cd: 7, desc: 'Фейковые шаги и призрачные метки' },
    ult: { name: 'ХОР', cost: 100, desc: '8 с: врагам трясёт экран, разброс +40%' },
  },
  {
    id: 'zhizha',
    name: 'ЖИЖА',
    emoji: '🫠',
    role: 'Танк',
    desc: 'Была человеком. Потом — кислотой. Теперь — обоим.',
    hp: 180,
    speed: 0.75,
    jump: 0.95,
    color: 0xffe600,
    weapon: {
      name: 'Шланг', damage: 12, fireRate: 8, mag: 80, reloadTime: 2.2,
      spread: 0.1, range: 18, auto: true, slow: 0.35,
    },
    q: { name: 'Кислотная лужа', cd: 9, desc: 'Лужа: врагам урон и замедление, своим +10% брони' },
    e: { name: 'Желе-стена', cd: 11, desc: 'Слизневая стена: прошедшие сквозь замедлены' },
    ult: { name: 'ПОГЛОЩЕНИЕ', cost: 100, desc: '5 с: враги рядом вязнут, ты лечишься' },
  },
];

// ============ Карточки ============
export type CardType = 'upgrade' | 'mutation' | 'ruin' | 'chaos';
export type CardRarity = 'обычная' | 'редкая' | 'ШИЗО';

export interface CardDef {
  id: string;
  name: string;
  type: CardType;
  rarity: CardRarity;
  desc: string;
  flavor: string;
  // Модификаторы владельца (пассивные, пока карта в руке)
  mods?: Partial<PlayerMods>;
  // Событийные хуки
  onSlideJump?: boolean;
  periodicChih?: boolean;
  // Руины / хаос — длительные эффекты
  curse?: string;
  duration?: number;
  target?: 'enemy' | 'all' | 'self';
}

export interface PlayerMods {
  speedMult: number;
  fireRateMult: number;
  damageMult: number;
  reloadMult: number;
  jumpMult: number;
  critChance: number;
  damageReduction: number;
  bhopWindowMult: number;
  slideFrictionMult: number;
  wallhack: number; // радиус подсветки врагов
  slideJumpBoost: number;
  chihInterval: number;
  reloadSpeedMult: number;
}

export const DEFAULT_MODS: PlayerMods = {
  speedMult: 1,
  fireRateMult: 1,
  damageMult: 1,
  reloadMult: 1,
  jumpMult: 1,
  critChance: 0.05,
  damageReduction: 0,
  bhopWindowMult: 1,
  slideFrictionMult: 1,
  wallhack: 0,
  slideJumpBoost: 0.15,
  chihInterval: 0,
  reloadSpeedMult: 1,
};

export const CARDS: CardDef[] = [
  // ——— Апгрейды ———
  { id: 'palec', name: '+1 ПАЛЕЦ', type: 'upgrade', rarity: 'обычная', desc: '+15% скорострельности', flavor: 'Рука выглядит неправильно. Все это замечают', mods: { fireRateMult: 1.15 } },
  { id: 'nos', name: 'ВТОРОЙ НОС', type: 'upgrade', rarity: 'редкая', desc: 'Враги подсвечиваются сквозь стены в 8 м', flavor: 'Ты их нюхаешь. Они это чувствуют', mods: { wallhack: 8 } },
  { id: 'sliz', name: 'СЛИЗЬ', type: 'upgrade', rarity: 'обычная', desc: '+25% скорости бега', flavor: 'Тормозишь как на льду, заносы включены', mods: { speedMult: 1.25, slideFrictionMult: 0.6 } },
  { id: 'kassety', name: 'БРОНЯ ИЗ КАССЕТ', type: 'upgrade', rarity: 'обычная', desc: '−15% получаемого урона', flavor: 'При каждом попадании играет случайный брейкбит', mods: { damageReduction: 0.15 } },
  { id: 'glaza', name: 'ТРИ ГЛАЗА', type: 'upgrade', rarity: 'редкая', desc: '+20% шанс крита', flavor: 'FOV слегка дёргается, как будто ты не здесь', mods: { critChance: 0.25 } },
  { id: 'moon', name: 'ЛУННЫЕ БАТИНКИ', type: 'upgrade', rarity: 'обычная', desc: 'Прыжок ×2', flavor: 'Шаги звучат как будто ты в ванной', mods: { jumpMult: 2 } },
  { id: 'chih', name: 'БАСОВИТЫЙ ЧИХ', type: 'upgrade', rarity: 'редкая', desc: 'Каждые 12 с чихаешь, отбрасывая врагов в 3 м', flavor: 'Будь здоров', periodicChih: true, mods: { chihInterval: 12 } },
  { id: 'coffee', name: 'КОФЕ ИЗ АКВАРИУМА', type: 'upgrade', rarity: 'обычная', desc: '+30% скорость перезарядки', flavor: 'Лёгкая вибрация экрана. Всегда', mods: { reloadSpeedMult: 1.3 } },
  { id: 'skate', name: 'СКЕЙТОВЫЕ КРОССОВКИ', type: 'upgrade', rarity: 'обычная', desc: 'Окно бхопа +50%, слайд скользит дальше', flavor: 'Колёсики не снимаются', mods: { bhopWindowMult: 1.5, slideFrictionMult: 0.7 } },
  { id: 'rockets', name: 'РАКЕТЫ НА НОСКАХ', type: 'upgrade', rarity: 'редкая', desc: 'Слайд-прыжок даёт +40% скорости на 2 с', flavor: 'Пахнет палёным', onSlideJump: true },

  // ——— Мутации ———
  { id: 'shilo-raketa', name: 'ШИЛО-РАКЕТА', type: 'mutation', rarity: 'редкая', desc: 'Любой рывок/прыжок подбрасывает врагов вверх', flavor: '' },
  { id: 'dvoinaya', name: 'ДВОЙНАЯ СПОРА', type: 'mutation', rarity: 'редкая', desc: 'E-способность ставится дважды (второй заряд — 50% силы)', flavor: '' },
  { id: 'echo', name: 'ГРОМКОЕ ЭХО', type: 'mutation', rarity: 'редкая', desc: 'Голос в микрофоне ускоряет заряд ульты (+15%)', flavor: '' },
  { id: 'acid2', name: 'КИСЛОТА ×2', type: 'mutation', rarity: 'обычная', desc: 'Все лужи/облака на 50% больше и живут дольше', flavor: '' },
  { id: 'tele-shiza', name: 'ТЕЛЕПОРТ-ШИЗА', type: 'mutation', rarity: 'редкая', desc: 'Q оставляет клона на месте (враги по нему стреляют)', flavor: '' },
  { id: 'ulta-echo', name: 'УЛЬТА-ЭХО', type: 'mutation', rarity: 'ШИЗО', desc: 'После смерти ульта срабатывает бесплатно (1 раз)', flavor: '' },

  // ——— Руины ———
  { id: 'mirror', name: 'ЗЕРКАЛО', type: 'ruin', rarity: 'редкая', desc: 'Управление врага инвертировано 8 с', flavor: 'Влево — это вправо. Это навсегда. Почти', curse: 'mirror', duration: 8 },
  { id: 'hat', name: 'ШЛЯПА', type: 'ruin', rarity: 'обычная', desc: 'На врага падает гигантская шляпа, закрывая экран на 5 с', flavor: 'Шляпа красивая', curse: 'hat', duration: 5 },
  { id: 'steps', name: 'ФАНТОМНЫЕ ШАГИ', type: 'ruin', rarity: 'обычная', desc: '15 с враг слышит фейковые шаги вокруг', flavor: 'Кто-то ходит. Никого нет', curse: 'steps', duration: 15 },
  { id: 'fakehp', name: 'ЛОЖНЫЙ УРОН', type: 'ruin', rarity: 'обычная', desc: 'Экран врага имитирует урон 10 с (включая фейковые криты)', flavor: 'Он лечится. Ему не лучше', curse: 'fakehp', duration: 10 },
  { id: 'podslushka', name: 'ПОДСЛУШКА', type: 'ruin', rarity: 'редкая', desc: '20 с ты слышишь войс-чат врагов', flavor: 'Приятного прослушивания', curse: 'podslushka', duration: 20 },
  { id: 'flies', name: 'ЖУЖЖАНИЕ', type: 'ruin', rarity: 'обычная', desc: 'Мухи у врага: −10% точности и приглушённый звук 12 с', flavor: 'Мухи. Просто мухи. Всегда', curse: 'flies', duration: 12 },
  { id: 'oldshoes', name: 'СТАРЫЕ КРОССОВКИ', type: 'ruin', rarity: 'обычная', desc: '−30% скорости врага на 12 с', flavor: 'Подошва отклеилась', curse: 'oldshoes', duration: 12 },
  { id: 'slippery', name: 'СКОЛЬЗКИЙ ПОЛ', type: 'ruin', rarity: 'редкая', desc: 'Трение врага ×0.3 на 10 с', flavor: 'Катается. Не по своей воле', curse: 'slippery', duration: 10 },

  // ——— Хаос ———
  { id: 'trip', name: 'ТРИП', type: 'chaos', rarity: 'редкая', desc: 'У ВСЕХ инвертируются цвета на 15 с', flavor: 'Это не баг', curse: 'trip', duration: 15, target: 'all' },
  { id: 'swap', name: 'ОБМЕН ТЕЛАМИ', type: 'chaos', rarity: 'ШИЗО', desc: 'Два случайных игрока меняются местами', flavor: 'Кто я? где я?', curse: 'swap', target: 'all' },
  { id: 'voicecharge', name: 'ГОЛОСОВОЙ ЗАРЯД', type: 'chaos', rarity: 'редкая', desc: '10 с: голос даёт +10% ульты ВСЕМ', flavor: 'Болтайте все', curse: 'voicecharge', duration: 10, target: 'all' },
  { id: 'frogs', name: 'ДОЖДЬ ИЗ ЖАБ', type: 'chaos', rarity: 'ШИЗО', desc: '20 с с неба падают жабы, попадание = замедление', flavor: 'Они безобидные. Почти', curse: 'frogs', duration: 20, target: 'all' },
  { id: 'vol11', name: 'ГРОМКОСТЬ 11', type: 'chaos', rarity: 'обычная', desc: '12 с: весь звук ×2, войс искажается', flavor: 'Соседи в восторге', curse: 'vol11', duration: 12, target: 'all' },
  { id: 'bass', name: 'ОБЩИЙ БАСС', type: 'chaos', rarity: 'редкая', desc: '8 с: у всех трясётся прицел в такт биту', flavor: 'Не у всех одинаковый такт', curse: 'bass', duration: 8, target: 'all' },
];

// ============ Тюнинг мувмента ============
export const TUNE = {
  gravity: 24,
  jumpVel: 7.6,          // ~1.2 м
  baseSpeed: 7.0,        // м/с, перманентный бег
  maxSpeed: 14.0,        // потолок разгонов
  groundAccel: 90,
  airAccel: 28,
  groundFriction: 8.5,
  slideFriction: 1.1,
  slideBoostMult: 1.5,
  slideMinSpeed: 4.0,
  slideStartMin: 6.0,
  slideJumpBoost: 0.15,  // +15% на слайд-прыжке
  bhopWindow: 0.15,      // с
  bhopDecay: 0.05,       // −5% за прыжок без стрейфа
  coyoteTime: 0.1,
  jumpBuffer: 0.15,
  airSpeedCap: 2.2,      // wishspeed cap для air accel
  playerRadius: 0.42,
  playerHeight: 1.75,
  crouchHeight: 0.95,
  // Голос = газ
  voiceWhisper: 0.1,
  voiceTalk: 0.25,
  voiceShout: 0.35,
  // Бой
  respawnTime: 3,
  ultPerDamage: 0.55,    // % заряда за единицу урона
  ultPerKill: 18,
  roundKillTarget: 5,
  roundTime: 150,        // с
  roundsToWin: 3,
};

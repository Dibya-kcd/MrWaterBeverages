/**
 * Offline English → Odia *sound-alike* writing (transliteration), not meaning-translation.
 *   Purple → ପର୍ପଲ୍      Gold → ଗୋଲ୍ଡ      Sharma Stores → ଶର୍ମା ଷ୍ଟୋର୍ସ
 * 1) known words / phrases come from a dictionary (brands, flavours, shop words, common surnames)
 * 2) anything else is written letter-by-letter with the rules below
 * Used only for the salesman view. An explicit `nameOr` typed on a product / customer always wins.
 */

export type NameKind = 'product' | 'person';

const ODIA_RANGE = /[଀-୿]/;
const VIRAMA = '୍'; // ୍

/** Whole words (upper-case key). Multi-word keys are matched first. */
const WORDS: Record<string, string> = {
  // ── flavours / drink words ──
  PURPLE: 'ପର୍ପଲ୍', GOLD: 'ଗୋଲ୍ଡ', SILVER: 'ସିଲ୍ଭର୍', BLUE: 'ବ୍ଲୁ', GREEN: 'ଗ୍ରୀନ୍', RED: 'ରେଡ୍',
  BLACK: 'ବ୍ଲାକ୍', WHITE: 'ହ୍ୱାଇଟ୍', YELLOW: 'ୟେଲୋ', PINK: 'ପିଙ୍କ୍', ORANGE: 'ଅରେଞ୍ଜ୍', LEMON: 'ଲେମନ୍',
  'CLEAR LEMON': 'କ୍ଲିଅର୍ ଲେମନ୍', LIME: 'ଲାଇମ୍', COLA: 'କୋଲା', COKE: 'କୋକ୍', MANGO: 'ମାଙ୍ଗୋ', APPLE: 'ଆପଲ୍',
  'APPLE FIZZ': 'ଆପଲ୍ ଫିଜ୍', FIZZ: 'ଫିଜ୍', GRAPE: 'ଗ୍ରେପ୍', GRAPES: 'ଗ୍ରେପ୍ସ', GUAVA: 'ଗୁଆଭା',
  PINEAPPLE: 'ପାଇନାପଲ୍', LITCHI: 'ଲିଚି', LYCHEE: 'ଲିଚି', BERRY: 'ବେରୀ', STRAWBERRY: 'ଷ୍ଟ୍ରବେରୀ',
  JEERA: 'ଜିରା', ZEERA: 'ଜିରା', MASALA: 'ମସଲା', GINGER: 'ଜିଞ୍ଜର୍', MINT: 'ମିଣ୍ଟ୍', COCONUT: 'କୋକୋନଟ୍',
  'MIX FRUIT': 'ମିକ୍ସ ଫ୍ରୁଟ୍', 'MIX-FRUIT': 'ମିକ୍ସ-ଫ୍ରୁଟ୍', FRUIT: 'ଫ୍ରୁଟ୍', JUICE: 'ଜୁସ୍', JOOS: 'ଜୁସ୍',
  'NIMBU PAANI': 'ନିମ୍ବୁ ପାନି', 'NIMBU PANI': 'ନିମ୍ବୁ ପାନି', NIMBU: 'ନିମ୍ବୁ', PANI: 'ପାଣି', PAANI: 'ପାନି',
  LEMONADE: 'ଲେମନେଡ୍', SODA: 'ସୋଡ଼ା', SPARKLING: 'ସ୍ପାର୍କଲିଂ', WATER: 'ୱାଟର୍', MINERAL: 'ମିନେରାଲ୍',
  PACKAGED: 'ପ୍ୟାକେଜ୍ଡ୍', DRINKING: 'ଡ୍ରିଙ୍କିଂ', 'ENERGY DRINK': 'ଏନର୍ଜି ଡ୍ରିଙ୍କ୍', ENERGY: 'ଏନର୍ଜି',
  DRINK: 'ଡ୍ରିଙ୍କ୍', COLD: 'କୋଲ୍ଡ', 'COLD DRINK': 'କୋଲ୍ଡ ଡ୍ରିଙ୍କ୍', TONIC: 'ଟନିକ୍', MILK: 'ମିଲ୍କ',
  SHAKE: 'ସେକ୍', LASSI: 'ଲସି', BUTTERMILK: 'ବଟରମିଲ୍କ', TEA: 'ଟି', COFFEE: 'କଫି',
  // ── brands ──
  CAMPA: 'କ୍ୟାମ୍ପା', BOOST: 'ବୁଷ୍ଟ୍', POWER: 'ପାୱାର୍', 'POWER UP': 'ପାୱାର୍ ଅପ୍', NEON: 'ନିୟନ୍', VIBE: 'ଭାଇବ୍',
  'E.H. VIBE': 'ଇ.ଏଚ୍. ଭାଇବ୍', RUNNER: 'ରନର୍', SOSYO: 'ସୋସିଓ', RASKIK: 'ରସିକ', ARMOUR: 'ଆର୍ମର୍',
  PEPSI: 'ପେପ୍ସି', SPRITE: 'ସ୍ପ୍ରାଇଟ୍', FANTA: 'ଫାଣ୍ଟା', LIMCA: 'ଲିମ୍କା', MIRINDA: 'ମିରିଣ୍ଡା', MAAZA: 'ମାଜା',
  FROOTI: 'ଫ୍ରୁଟି', SLICE: 'ସ୍ଲାଇସ୍', 'THUMS UP': 'ଥମ୍ସ ଅପ୍', 'THUMSUP': 'ଥମ୍ସ ଅପ୍', 'COCA COLA': 'କୋକା କୋଲା',
  'COCA-COLA': 'କୋକା-କୋଲା', 'MOUNTAIN DEW': 'ମାଉଣ୍ଟେନ୍ ଡ୍ୟୁ', DEW: 'ଡ୍ୟୁ', '7UP': 'ସେଭେନ୍ ଅପ୍', BISLERI: 'ବିସଲେରୀ',
  KINLEY: 'କିନଲେ', AQUAFINA: 'ଆକ୍ୱାଫିନା', REAL: 'ରିଅଲ୍', TROPICANA: 'ଟ୍ରୋପିକାନା', APPY: 'ଆପି', MONSTER: 'ମନଷ୍ଟର୍',
  'RED BULL': 'ରେଡ୍ ବୁଲ୍', GATORADE: 'ଗେଟୋରେଡ୍', 'PAPER BOAT': 'ପେପର୍ ବୋଟ୍',
  // ── pack / size words ──
  EXTRA: 'ଏକ୍ସଟ୍ରା', SPECIAL: 'ସ୍ପେସିଆଲ୍', CLASSIC: 'କ୍ଲାସିକ୍', ROYAL: 'ରୟାଲ୍', PREMIUM: 'ପ୍ରିମିୟମ୍', DIET: 'ଡାଏଟ୍',
  ZERO: 'ଜିରୋ', MINI: 'ମିନି', MEGA: 'ମେଗା', JUMBO: 'ଜମ୍ବୋ', FAMILY: 'ଫ୍ୟାମିଲି', PACK: 'ପ୍ୟାକ୍', CASE: 'କେସ୍',
  CRATE: 'କ୍ରେଟ୍', BOTTLE: 'ବୋତଲ', CAN: 'କ୍ୟାନ୍', PET: 'ପେଟ୍', GLASS: 'ଗ୍ଲାସ୍', RGB: 'ଆର୍.ଜି.ବି.', TETRA: 'ଟେଟ୍ରା',
  NRB: 'ଏନ୍.ଆର୍.ବି.', SACHET: 'ସାଶେ', POUCH: 'ପାଉଚ୍', CUP: 'କପ୍', NEW: 'ନ୍ୟୁ', ORIGINAL: 'ଅରିଜିନାଲ୍',
  // ── shop / firm words ──
  STORE: 'ଷ୍ଟୋର୍', STORES: 'ଷ୍ଟୋର୍ସ', TRADERS: 'ଟ୍ରେଡର୍ସ', TRADER: 'ଟ୍ରେଡର୍', TRADING: 'ଟ୍ରେଡିଂ', TRADE: 'ଟ୍ରେଡ୍',
  ENTERPRISE: 'ଏଣ୍ଟରପ୍ରାଇଜ୍', ENTERPRISES: 'ଏଣ୍ଟରପ୍ରାଇଜେସ୍', AGENCY: 'ଏଜେନ୍ସି',
  AGENCIES: 'ଏଜେନ୍ସିଜ୍', GENERAL: 'ଜେନେରାଲ୍', KIRANA: 'କିରାନା', MART: 'ମାର୍ଟ', SUPERMART: 'ସୁପରମାର୍ଟ',
  SUPER: 'ସୁପର', SHOP: 'ସପ୍', SHOPPEE: 'ସପି', HOTEL: 'ହୋଟେଲ୍', RESTAURANT: 'ରେଷ୍ଟୁରାଣ୍ଟ', DHABA: 'ଢାବା',
  SWEETS: 'ସ୍ୱିଟ୍ସ', SWEET: 'ସ୍ୱିଟ୍', BAKERY: 'ବେକେରୀ', CAFE: 'କାଫେ', STALL: 'ଷ୍ଟଲ୍', CORNER: 'କର୍ଣ୍ଣର',
  BHANDAR: 'ଭଣ୍ଡାର', BHANDARA: 'ଭଣ୍ଡାର', BHAWAN: 'ଭବନ', BHAVAN: 'ଭବନ', DISTRIBUTOR: 'ଡିଷ୍ଟ୍ରିବ୍ୟୁଟର୍',
  DISTRIBUTORS: 'ଡିଷ୍ଟ୍ରିବ୍ୟୁଟର୍ସ', WHOLESALE: 'ହୋଲସେଲ୍', RETAIL: 'ରିଟେଲ୍', WHOLESALER: 'ହୋଲସେଲର୍',
  COMPANY: 'କମ୍ପାନୀ', CO: 'କୋ', PVT: 'ପ୍ରାଇଭେଟ୍', LTD: 'ଲିମିଟେଡ୍', LIMITED: 'ଲିମିଟେଡ୍', PRIVATE: 'ପ୍ରାଇଭେଟ୍',
  'M/S': 'ମେସର୍ସ', MS: 'ମେସର୍ସ', MESSERS: 'ମେସର୍ସ', BROTHERS: 'ବ୍ରଦର୍ସ', BROS: 'ବ୍ରଦର୍ସ', SONS: 'ସନ୍ସ',
  AND: 'ଏଣ୍ଡ୍', PAN: 'ପାନ', CHOWK: 'ଚୌକ', SQUARE: 'ସ୍କୋୟାର', ROAD: 'ରୋଡ୍', MARKET: 'ମାର୍କେଟ୍', STAND: 'ଷ୍ଟାଣ୍ଡ୍',
  BUS: 'ବସ୍', STATION: 'ଷ୍ଟେସନ୍', COLLEGE: 'କଲେଜ୍', SCHOOL: 'ସ୍କୁଲ୍', HOSPITAL: 'ହସ୍ପିଟାଲ୍', TEMPLE: 'ମନ୍ଦିର',
  MANDIR: 'ମନ୍ଦିର', NAGAR: 'ନଗର', VIHAR: 'ବିହାର', SQ: 'ସ୍କୋୟାର', CENTER: 'ସେଣ୍ଟର୍', CENTRE: 'ସେଣ୍ଟର୍',
  POINT: 'ପଏଣ୍ଟ', PLAZA: 'ପ୍ଲାଜା', COMPLEX: 'କମ୍ପ୍ଲେକ୍ସ', SERVICE: 'ସର୍ଭିସ୍', SERVICES: 'ସର୍ଭିସେସ୍',
  // ── common names / titles ──
  SRI: 'ଶ୍ରୀ', SHRI: 'ଶ୍ରୀ', SHREE: 'ଶ୍ରୀ', SREE: 'ଶ୍ରୀ', MAA: 'ମା', MA: 'ମା', JAI: 'ଜୟ', JAY: 'ଜୟ', SAI: 'ସାଇ',
  BABA: 'ବାବା', LAXMI: 'ଲକ୍ଷ୍ମୀ', LAKSHMI: 'ଲକ୍ଷ୍ମୀ', GANESH: 'ଗଣେଶ', GANESHA: 'ଗଣେଶ', DURGA: 'ଦୁର୍ଗା',
  JAGANNATH: 'ଜଗନ୍ନାଥ', JAGANATH: 'ଜଗନ୍ନାଥ', KALI: 'କାଳୀ', BALAJI: 'ବାଲାଜୀ', HANUMAN: 'ହନୁମାନ', SHIV: 'ଶିବ',
  SHIVA: 'ଶିବ', RADHA: 'ରାଧା', KRISHNA: 'କୃଷ୍ଣ', RAM: 'ରାମ', SITA: 'ସୀତା', SARASWATI: 'ସରସ୍ୱତୀ', MAHADEV: 'ମହାଦେବ',
  SATYA: 'ସତ୍ୟ', SAHU: 'ସାହୁ', SAHOO: 'ସାହୁ', DAS: 'ଦାସ', DASH: 'ଦାଶ', BEHERA: 'ବେହେରା', NAYAK: 'ନାୟକ',
  PATRA: 'ପାତ୍ର', PATRO: 'ପାତ୍ର', MOHANTY: 'ମହାନ୍ତି', MAHANTA: 'ମହାନ୍ତ', PANDA: 'ପଣ୍ଡା', PRADHAN: 'ପ୍ରଧାନ',
  SWAIN: 'ସ୍ୱାଇଁ', JENA: 'ଜେନା', BISWAL: 'ବିଶ୍ୱାଳ', ROUT: 'ରାଉତ', SAMAL: 'ସାମଲ', BARIK: 'ବାରିକ', MISHRA: 'ମିଶ୍ର',
  MISRA: 'ମିଶ୍ର', SHARMA: 'ଶର୍ମା', AGARWAL: 'ଅଗ୍ରୱାଲ୍', AGARWALA: 'ଅଗ୍ରୱାଲ୍', GUPTA: 'ଗୁପ୍ତା', JAIN: 'ଜୈନ',
  SINGH: 'ସିଂହ', KUMAR: 'କୁମାର', RAO: 'ରାଓ', REDDY: 'ରେଡ୍ଡୀ', MAHAPATRA: 'ମହାପାତ୍ର', PATEL: 'ପଟେଲ୍',
  PADHI: 'ପାଢ଼ୀ', NANDA: 'ନନ୍ଦ', MALLICK: 'ମଲ୍ଲିକ', MALIK: 'ମଲ୍ଲିକ', KHAN: 'ଖାନ୍', SAHA: 'ସାହା', GHOSH: 'ଘୋଷ',
  BHOI: 'ଭୋଇ', SETHI: 'ସେଠୀ', SETH: 'ସେଠ', TRIPATHY: 'ତ୍ରିପାଠୀ', ACHARYA: 'ଆଚାର୍ଯ୍ୟ', MOHAPATRA: 'ମହାପାତ୍ର',
  PARIDA: 'ପରିଡ଼ା', MUNDA: 'ମୁଣ୍ଡା', MAJHI: 'ମାଝୀ', NAIK: 'ନାଏକ',
  ODISHA: 'ଓଡ଼ିଶା', ORISSA: 'ଓଡ଼ିଶା', BHUBANESWAR: 'ଭୁବନେଶ୍ୱର', CUTTACK: 'କଟକ', PURI: 'ପୁରୀ',
  BERHAMPUR: 'ବ୍ରହ୍ମପୁର', SAMBALPUR: 'ସମ୍ବଲପୁର', ROURKELA: 'ରାଉରକେଲା', BALASORE: 'ବାଲେଶ୍ୱର', BALESWAR: 'ବାଲେଶ୍ୱର',
};

/** Letter names, for initials such as "R. K. Traders". */
const LETTER_NAMES: Record<string, string> = {
  A: 'ଏ', B: 'ବି', C: 'ସି', D: 'ଡି', E: 'ଇ', F: 'ଏଫ୍', G: 'ଜି', H: 'ଏଚ୍', I: 'ଆଇ', J: 'ଜେ', K: 'କେ', L: 'ଏଲ୍',
  M: 'ଏମ୍', N: 'ଏନ୍', O: 'ଓ', P: 'ପି', Q: 'କିଉ', R: 'ଆର୍', S: 'ଏସ୍', T: 'ଟି', U: 'ୟୁ', V: 'ଭି', W: 'ଡବ୍ଲ୍ୟୁ',
  X: 'ଏକ୍ସ', Y: 'ୱାଇ', Z: 'ଜେଡ୍',
};

/** Units written after a number: 250ml, 2L, 1 ltr, 500 gm. */
const UNITS: Record<string, string> = {
  ML: 'ମି.ଲି.', L: 'ଲି.', LTR: 'ଲି.', LTRS: 'ଲି.', LT: 'ଲି.', LITRE: 'ଲି.', LITER: 'ଲି.', LITRES: 'ଲି.',
  KG: 'କି.ଗ୍ରା.', KGS: 'କି.ଗ୍ରା.', G: 'ଗ୍ରା.', GM: 'ଗ୍ରା.', GMS: 'ଗ୍ରା.', GRAM: 'ଗ୍ରା.', PCS: 'ପିସ୍', PC: 'ପିସ୍',
  CL: 'ସି.ଲି.',
};

// ── letter-by-letter rules ────────────────────────────────────────────────

const INDEP_VOWEL: Record<string, string> = {
  a: 'ଅ', aa: 'ଆ', i: 'ଇ', ee: 'ଈ', ii: 'ଈ', u: 'ଉ', oo: 'ଊ', e: 'ଏ', ai: 'ଐ', o: 'ଓ', au: 'ଔ',
};
const MATRA: Record<string, string> = {
  a: '', aa: 'ା', i: 'ି', ee: 'ୀ', ii: 'ୀ', u: 'ୁ', oo: 'ୂ', e: 'େ', ai: 'ୈ', o: 'ୋ', au: 'ୌ',
};
// vowel spellings → vowel key (longest first)
const VOWEL_SPELL: [string, string][] = [
  ['aa', 'aa'], ['ai', 'ai'], ['ay', 'e'], ['au', 'au'], ['aw', 'au'], ['ee', 'ee'], ['ea', 'ee'], ['ie', 'ee'],
  ['ii', 'ii'], ['oo', 'oo'], ['ou', 'au'], ['ow', 'au'], ['oa', 'o'], ['ei', 'e'], ['ey', 'e'], ['oy', 'o'],
  ['a', 'a'], ['e', 'e'], ['i', 'i'], ['o', 'o'], ['u', 'u'],
];

function consonantTable(kind: NameKind): [string, string][] {
  const t = kind === 'person' ? 'ତ' : 'ଟ';
  const d = kind === 'person' ? 'ଦ' : 'ଡ';
  return [
    ['ksh', 'କ୍ଷ'], ['chh', 'ଛ'], ['ch', 'ଚ'], ['kh', 'ଖ'], ['gh', 'ଘ'], ['jh', 'ଝ'], ['th', 'ଥ'], ['dh', 'ଧ'],
    ['ph', 'ଫ'], ['bh', 'ଭ'], ['sh', 'ଶ'], ['ck', 'କ'], ['ng', 'ଙ୍ଗ'], ['nk', 'ଙ୍କ'], ['qu', 'କ୍ୱ'],
    ['k', 'କ'], ['g', 'ଗ'], ['c', 'କ'], ['j', 'ଜ'], ['t', t], ['d', d], ['n', 'ନ'], ['p', 'ପ'], ['b', 'ବ'],
    ['m', 'ମ'], ['y', 'ଯ'], ['r', 'ର'], ['l', 'ଲ'], ['v', 'ଭ'], ['w', 'ୱ'], ['s', 'ସ'], ['h', 'ହ'], ['f', 'ଫ'],
    ['z', 'ଜ'], ['q', 'କ'], ['x', 'କ୍ସ'],
  ];
}

type Unit = { type: 'c'; odia: string } | { type: 'v'; key: string };

function tokenizeWord(word: string, kind: NameKind): Unit[] {
  const cons = consonantTable(kind);
  const w = word.toLowerCase();
  const out: Unit[] = [];
  let i = 0;
  while (i < w.length) {
    const rest = w.slice(i);
    // 'y' / 'w' at the end of a word after a consonant behaves like a vowel (Sunny, Baby)
    if (rest === 'y' && out.length && out[out.length - 1].type === 'c') {
      out.push({ type: 'v', key: 'ii' });
      i += 1;
      continue;
    }
    // 'c' before e / i / y is soft (Cycle, Cell)
    if (rest[0] === 'c' && /^c[eiy]/.test(rest)) {
      out.push({ type: 'c', odia: 'ସ' });
      i += 1;
      continue;
    }
    // doubled consonant letter → single sound (Bottle, Kutty)
    if (rest.length > 1 && rest[0] === rest[1] && !'aeiou'.includes(rest[0]) && /[a-z]/.test(rest[0])) {
      i += 1;
      continue;
    }
    const v = VOWEL_SPELL.find(([sp]) => rest.startsWith(sp));
    if (v) {
      out.push({ type: 'v', key: v[1] });
      i += v[0].length;
      continue;
    }
    const c = cons.find(([sp]) => rest.startsWith(sp));
    if (c) {
      out.push({ type: 'c', odia: c[1] });
      i += c[0].length;
      continue;
    }
    i += 1; // unknown character (apostrophe etc.)
  }
  return out;
}

function writeWord(word: string, kind: NameKind): string {
  const units = tokenizeWord(word, kind);
  let out = '';
  for (let i = 0; i < units.length; i++) {
    const u = units[i];
    const prev = units[i - 1];
    const next = units[i + 1];
    if (u.type === 'v') {
      if (prev && prev.type === 'c') {
        // vowel after a consonant → vowel sign. A word-final "a" is the long ā (Sharma → ଶର୍ମା)
        const key = u.key === 'a' && !next && i > 0 ? 'aa' : u.key;
        out += MATRA[key] ?? '';
      } else {
        const key = u.key === 'a' && !next && prev ? 'aa' : u.key;
        out += INDEP_VOWEL[key] ?? '';
      }
    } else {
      out += u.odia;
      if (next && next.type === 'c') out += VIRAMA; // consonant cluster
      else if (!next && kind === 'product') out += VIRAMA; // English words end hard: ଗୋଲ୍ଡ
    }
  }
  return out;
}

// ── public API ────────────────────────────────────────────────────────────

/** True when the text still has Latin letters to convert. */
export function hasLatin(text: string): boolean {
  return /[A-Za-z]/.test(text || '');
}

/**
 * Write an English name in Odia script.
 * `kind` picks dental vs retroflex t/d and the word-final sound: 'person' for shops / people, 'product' for drinks.
 */
export function transliterateToOdia(text: string, kind: NameKind = 'product'): string {
  const src = (text || '').trim();
  if (!src) return '';
  if (!hasLatin(src)) return src;

  // split into words / numbers / separators, keeping everything
  const parts = src.match(/[A-Za-z][A-Za-z']*|\d+(?:\.\d+)?|[^A-Za-z\d]+/g) || [src];
  const out: string[] = [];
  let i = 0;
  while (i < parts.length) {
    const p = parts[i];
    if (!/^[A-Za-z]/.test(p)) {
      out.push(p);
      i += 1;
      continue;
    }
    // phrase match: up to 3 words joined by a single space or hyphen
    let matched = false;
    for (let n = 3; n >= 2 && !matched; n--) {
      const seg = parts.slice(i, i + n * 2 - 1);
      if (seg.length !== n * 2 - 1) continue;
      let ok = true;
      for (let k = 0; k < seg.length; k++) {
        const isWord = k % 2 === 0;
        if (isWord ? !/^[A-Za-z]/.test(seg[k]) : !/^[ -]$/.test(seg[k])) ok = false;
      }
      if (!ok) continue;
      const key = seg.join('').toUpperCase().replace(/-/g, ' ');
      const hit = WORDS[key] ?? WORDS[seg.join('').toUpperCase()];
      if (hit) {
        out.push(hit);
        i += seg.length;
        matched = true;
      }
    }
    if (matched) continue;

    // two-word phrase handled above; now one word
    const up = p.toUpperCase().replace(/'/g, '');
    // unit after a number: 250ml / 2 L
    let back = out.length - 1;
    while (back >= 0 && out[back].trim() === '') back--;
    const afterNumber = back >= 0 && /^\d+(\.\d+)?$/.test(out[back]);
    if (afterNumber && UNITS[up]) {
      out.push(UNITS[up]);
    } else if (/^x$/i.test(p) && /\d/.test(out[out.length - 1] || '')) {
      out.push('x'); // 24x200
    } else if (WORDS[up]) {
      out.push(WORDS[up]);
    } else if (p.length === 1 && LETTER_NAMES[up] && parts[i + 1] && /^\./.test(parts[i + 1])) {
      out.push(LETTER_NAMES[up]); // initials "R."
    } else if (p.length === 1 && LETTER_NAMES[up] && /^[A-Z]$/.test(p) && parts.length > 1) {
      out.push(LETTER_NAMES[up]);
    } else {
      out.push(writeWord(p, kind));
    }
    i += 1;
  }
  return out.join('').replace(/\s+/g, ' ').trim();
}

export { ODIA_RANGE };

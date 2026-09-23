/**
 * DI themes: who/what the numbers describe and how questions phrase a cell, a group of cells or a derived
 * entity. Labels stay ≤ 10 characters so charts remain readable at 360 px.
 */

export function list(items: string[]): string {
  if (items.length === 1) return items[0];
  return `${items.slice(0, -1).join(', ')} and ${items[items.length - 1]}`;
}

const tidy = (s: string) => s.replace(/\s+/g, ' ').replace(/\s+([,.?])/g, '$1').trim();

/** Phrase builder shared by every grid-like data set. */
export interface Phraser {
  /** "the number of bicycles sold by shop P in 2023" */
  cell(r: string, c: string): string;
  /** Sum over several rows in one column (rows.length ≥ 2). */
  rows(rs: string[], c: string, all?: boolean): string;
  /** Sum over several columns in one row (cols.length ≥ 2). */
  cols(r: string, cs: string[], all?: boolean): string;
  /** "the average number of bicycles sold by shops P, Q and S in 2023" */
  avgRows(rs: string[], c: string): string;
  avgCols(r: string, cs: string[]): string;
  /** Short label for solution steps: "P, 2023". */
  short(r: string, c: string): string;
  /** "shop P" — used for derived-entity questions. */
  rowName(r: string): string;
  /** Plural noun of the counted item, e.g. "bicycles". */
  noun: string;
}

/* ------------------------------------------------------------------ */
/* Entity × (time | type) grids — rows are entities                    */
/* ------------------------------------------------------------------ */

export interface GridTheme {
  key: string;
  /** Short title, e.g. "bicycles sold". */
  title: string;
  /** Row header in tables, e.g. "Shop". */
  rowHeader: string;
  rowWord: string;
  rowPlural: string;
  rowPool: string[];
  /** 'time': columns are years/months/days; 'type': columns are kinds (Boys/Girls, Hindi/English). */
  colKind: 'time' | 'type';
  colPool: string[];
  /** Preposition for time columns ("in", "on"). */
  prep?: string;
  /**
   * Phrase template. {ROW} → "shop P" / "shops P and Q together"; {COL} → "in 2023" (time) or the type word.
   * Must start with "the number of".
   */
  tpl: string;
  /** Word used when all type columns are summed ("students"). */
  allTypes?: string;
  /** Types are written in lower case inside sentences ("girls", "online"). */
  lowerTypes?: boolean;
  noun: string;
  /** Sub-split used by derived questions: e.g. geared / non-geared. */
  split?: [string, string];
  /** Chart y-axis label. */
  yLabel: string;
}

export const GRID_THEMES: GridTheme[] = [
  {
    key: 'bicycles',
    title: 'bicycles sold',
    rowHeader: 'Shop',
    rowWord: 'shop',
    rowPlural: 'shops',
    rowPool: ['P', 'Q', 'R', 'S', 'T', 'U'],
    colKind: 'time',
    colPool: ['2021', '2022', '2023', '2024', '2025'],
    prep: 'in',
    tpl: 'the number of bicycles sold by {ROW} {COL}',
    noun: 'bicycles',
    split: ['geared', 'non-geared'],
    yLabel: 'Number of bicycles',
  },
  {
    key: 'laptops',
    title: 'laptops sold',
    rowHeader: 'Store',
    rowWord: 'store',
    rowPlural: 'stores',
    rowPool: ['A', 'B', 'C', 'D', 'E', 'F'],
    colKind: 'time',
    colPool: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    prep: 'in',
    tpl: 'the number of laptops sold by {ROW} {COL}',
    noun: 'laptops',
    split: ['sold on EMI', 'sold for cash'],
    yLabel: 'Number of laptops',
  },
  {
    key: 'visitors',
    title: 'visitors to parks',
    rowHeader: 'Park',
    rowWord: 'park',
    rowPlural: 'parks',
    rowPool: ['J', 'K', 'L', 'M', 'N', 'O'],
    colKind: 'time',
    colPool: ['Friday', 'Saturday', 'Sunday'],
    prep: 'on',
    tpl: 'the number of visitors to {ROW} {COL}',
    noun: 'visitors',
    split: ['children', 'adults'],
    yLabel: 'Number of visitors',
  },
  {
    key: 'cars',
    title: 'cars sold',
    rowHeader: 'Showroom',
    rowWord: 'showroom',
    rowPlural: 'showrooms',
    rowPool: ['A', 'B', 'C', 'D', 'E', 'F'],
    colKind: 'time',
    colPool: ['2020', '2021', '2022', '2023', '2024'],
    prep: 'in',
    tpl: 'the number of cars sold by {ROW} {COL}',
    noun: 'cars',
    split: ['electric', 'petrol'],
    yLabel: 'Number of cars',
  },
  {
    key: 'students',
    title: 'students in colleges',
    rowHeader: 'College',
    rowWord: 'college',
    rowPlural: 'colleges',
    rowPool: ['A', 'B', 'C', 'D', 'E', 'F'],
    colKind: 'type',
    colPool: ['Boys', 'Girls'],
    tpl: 'the number of {COL} in {ROW}',
    allTypes: 'students',
    lowerTypes: true,
    noun: 'students',
    split: ['hostellers', 'day scholars'],
    yLabel: 'Number of students',
  },
  {
    key: 'employees',
    title: 'employees in companies',
    rowHeader: 'Company',
    rowWord: 'company',
    rowPlural: 'companies',
    rowPool: ['M', 'N', 'O', 'P', 'Q', 'R'],
    colKind: 'type',
    colPool: ['Male', 'Female'],
    tpl: 'the number of {COL} employees in {ROW}',
    allTypes: '',
    lowerTypes: true,
    noun: 'employees',
    split: ['graduates', 'non-graduates'],
    yLabel: 'Number of employees',
  },
  {
    key: 'books',
    title: 'books sold',
    rowHeader: 'Seller',
    rowWord: 'seller',
    rowPlural: 'sellers',
    rowPool: ['A', 'B', 'C', 'D', 'E', 'F'],
    colKind: 'type',
    colPool: ['Hindi', 'English', 'Tamil', 'Bengali'],
    tpl: 'the number of {COL} books sold by {ROW}',
    allTypes: '',
    noun: 'books',
    split: ['paperbacks', 'hardbacks'],
    yLabel: 'Number of books',
  },
  {
    key: 'flats',
    title: 'flats built',
    rowHeader: 'Builder',
    rowWord: 'builder',
    rowPlural: 'builders',
    rowPool: ['P', 'Q', 'R', 'S', 'T', 'U'],
    colKind: 'type',
    colPool: ['1BHK', '2BHK', '3BHK'],
    tpl: 'the number of {COL} flats built by {ROW}',
    allTypes: '',
    noun: 'flats',
    split: ['sold', 'unsold'],
    yLabel: 'Number of flats',
  },
  {
    key: 'phones',
    title: 'phones sold',
    rowHeader: 'Brand',
    rowWord: 'brand',
    rowPlural: 'brands',
    rowPool: ['V', 'W', 'X', 'Y', 'Z'],
    colKind: 'type',
    colPool: ['Online', 'Offline'],
    tpl: 'the number of phones sold {COL} by {ROW}',
    allTypes: '',
    lowerTypes: true,
    noun: 'phones',
    split: ['5G phones', '4G phones'],
    yLabel: 'Number of phones',
  },
  {
    key: 'games',
    title: 'students playing games',
    rowHeader: 'School',
    rowWord: 'school',
    rowPlural: 'schools',
    rowPool: ['A', 'B', 'C', 'D', 'E', 'F'],
    colKind: 'type',
    colPool: ['Cricket', 'Football', 'Hockey', 'Kabaddi'],
    tpl: 'the number of students of {ROW} who play {COL}',
    allTypes: 'the given games',
    noun: 'students',
    split: ['girls', 'boys'],
    yLabel: 'Number of students',
  },
];

/** Phraser for an entity × (time|type) grid. `single` = one column only (simple bar chart). */
export function gridPhraser(t: GridTheme, single: boolean): Phraser {
  const rowText = (rs: string[], all = false) => {
    if (rs.length === 1) return `${t.rowWord} ${rs[0]}`;
    if (all) return `all the ${['', 'one', 'two', 'three', 'four', 'five', 'six', 'seven'][rs.length] ?? rs.length} ${t.rowPlural} together`;
    return `${t.rowPlural} ${list(rs)} together`;
  };
  const typeWord = (c: string) => (t.lowerTypes ? c.toLowerCase() : c);
  const colText = (cs: string[], all = false) => {
    if (single) return '';
    if (t.colKind === 'time') {
      if (cs.length === 1) return `${t.prep} ${cs[0]}`;
      if (all) return `${t.prep} all the given ${t.colPool[0].length === 4 ? 'years' : t.colPool[0].length === 3 ? 'months' : 'days'} together`;
      return `${t.prep} ${list(cs)} together`;
    }
    if (cs.length === 1) return typeWord(cs[0]);
    if (all && t.allTypes !== undefined) return t.allTypes;
    return list(cs.map(typeWord));
  };
  const fill = (row: string, col: string, lead: string) => {
    let s = t.tpl.replace('{ROW}', row).replace('{COL}', col);
    // "the number of  in college C" when a type word is empty
    s = s.replace('the number of', lead);
    return tidy(s);
  };
  return {
    noun: t.noun,
    cell: (r, c) => fill(rowText([r]), colText([c]), 'the number of'),
    rows: (rs, c, all) => fill(rowText(rs, all), colText([c]), 'the total number of'),
    cols: (r, cs, all) => fill(rowText([r]), colText(cs, all), 'the total number of'),
    avgRows: (rs, c) => fill(`${t.rowPlural} ${list(rs)}`, colText([c]), 'the average number of'),
    avgCols: (r, cs) => {
      if (t.colKind === 'time') return fill(rowText([r]), `per ${t.colPool[0].length === 4 ? 'year' : t.colPool[0].length === 3 ? 'month' : 'day'} ${t.prep} ${list(cs)}`, 'the average number of');
      return fill(rowText([r]), `${list(cs.map(typeWord))} (per type)`, 'the average number of');
    },
    short: (r, c) => (single ? `${t.rowWord} ${r}` : `${t.rowWord} ${r}, ${c}`),
    rowName: (r) => `${t.rowWord} ${r}`,
  };
}

/* ------------------------------------------------------------------ */
/* Time × entity grids — rows are time points (line charts)            */
/* ------------------------------------------------------------------ */

export interface TimeTheme {
  key: string;
  title: string;
  rowPool: string[];
  prep: string;
  unitWord: 'year' | 'month';
  /** Series names (≤ 10 chars) for multi-line charts. */
  seriesPool: string[];
  /** Phrase for one series, lower-case inside a sentence: "company A". */
  seriesText: (s: string) => string;
  /** Phrase when the chart has one series. */
  singleText: string;
  /** Template: {WHO} → series text, {WHEN} → "in 2021". */
  tpl: string;
  noun: string;
  split: [string, string];
  yLabel: string;
}

export const TIME_THEMES: TimeTheme[] = [
  {
    key: 'tractors',
    title: 'tractors manufactured',
    rowPool: ['2019', '2020', '2021', '2022', '2023', '2024'],
    prep: 'in',
    unitWord: 'year',
    seriesPool: ['Company A', 'Company B'],
    seriesText: (s) => s.replace('Company', 'company'),
    singleText: 'the company',
    tpl: 'the number of tractors manufactured by {WHO} {WHEN}',
    noun: 'tractors',
    split: ['exported', 'sold in India'],
    yLabel: 'Number of tractors',
  },
  {
    key: 'tickets',
    title: 'museum tickets sold',
    rowPool: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    prep: 'in',
    unitWord: 'month',
    seriesPool: ['Adults', 'Children'],
    seriesText: (s) => (s === 'Adults' ? 'adult' : 'child'),
    singleText: '',
    tpl: 'the number of {WHO} tickets sold by the museum {WHEN}',
    noun: 'tickets',
    split: ['booked online', 'bought at the counter'],
    yLabel: 'Number of tickets',
  },
  {
    key: 'scooters',
    title: 'scooters sold',
    rowPool: ['2019', '2020', '2021', '2022', '2023', '2024'],
    prep: 'in',
    unitWord: 'year',
    seriesPool: ['Dealer X', 'Dealer Y'],
    seriesText: (s) => s.replace('Dealer', 'dealer'),
    singleText: 'the dealer',
    tpl: 'the number of scooters sold by {WHO} {WHEN}',
    noun: 'scooters',
    split: ['electric', 'petrol'],
    yLabel: 'Number of scooters',
  },
  {
    key: 'parcels',
    title: 'parcels delivered',
    rowPool: ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'],
    prep: 'in',
    unitWord: 'month',
    seriesPool: ['Courier A', 'Courier B'],
    seriesText: (s) => s.replace('Courier', 'courier'),
    singleText: 'the courier',
    tpl: 'the number of parcels delivered by {WHO} {WHEN}',
    noun: 'parcels',
    split: ['delivered late', 'delivered on time'],
    yLabel: 'Number of parcels',
  },
];

export function timePhraser(t: TimeTheme, single: boolean): Phraser {
  const who = (cs: string[], all = false) => {
    if (single) return t.singleText;
    if (cs.length === 1) return t.seriesText(cs[0]);
    if (t.key === 'tickets') return all ? '' : list(cs.map(t.seriesText));
    return `${list(cs.map(t.seriesText))} together`;
  };
  const when = (rs: string[], all = false) => {
    if (rs.length === 1) return `${t.prep} ${rs[0]}`;
    if (all) return `in all the given ${t.unitWord}s together`;
    return `${t.prep} ${list(rs)} together`;
  };
  const fill = (w: string, wh: string, lead: string) => {
    let s = t.tpl.replace('{WHO}', w).replace('{WHEN}', wh);
    s = s.replace('the number of', lead);
    return tidy(s);
  };
  return {
    noun: t.noun,
    cell: (r, c) => fill(who([c]), when([r]), 'the number of'),
    rows: (rs, c, all) => fill(who([c]), when(rs, all), 'the total number of'),
    cols: (r, cs, all) => fill(who(cs, all), when([r]), 'the total number of'),
    avgRows: (rs, c) => fill(who([c]), `per ${t.unitWord} ${t.prep} ${list(rs)}`, 'the average number of'),
    avgCols: (r, cs) => fill(who(cs), when([r]), 'the average number of'),
    short: (r, c) => (single ? r : `${c}, ${r}`),
    rowName: (r) => r,
  };
}

/* ------------------------------------------------------------------ */
/* Pie themes                                                          */
/* ------------------------------------------------------------------ */

export interface PieTheme {
  key: string;
  title: string;
  /** "Total = 2,400 students" is built from these. */
  totalNoun: string;
  labels: string[];
  /** One slice: "the number of students who chose {L}". */
  one: string;
  /** Several slices: "students who chose {L}" is prefixed with "the total/average number of". */
  many: string;
  noun: string;
  split: [string, string];
}

export const PIE_THEMES: PieTheme[] = [
  {
    key: 'sports',
    title: 'students by favourite sport',
    totalNoun: 'students',
    labels: ['Cricket', 'Football', 'Hockey', 'Kabaddi', 'Tennis', 'Chess'],
    one: 'students who chose {L}',
    many: 'students who chose {L}',
    noun: 'students',
    split: ['girls', 'boys'],
  },
  {
    key: 'streams',
    title: 'students by stream',
    totalNoun: 'students',
    labels: ['Science', 'Commerce', 'Arts', 'Vocational', 'Agri', 'Law'],
    one: 'students in the {L} stream',
    many: 'students in the {L} streams',
    noun: 'students',
    split: ['girls', 'boys'],
  },
  {
    key: 'staff',
    title: 'employees by department',
    totalNoun: 'employees',
    labels: ['HR', 'Sales', 'IT', 'Finance', 'Admin', 'Legal'],
    one: 'employees in the {L} department',
    many: 'employees in the {L} departments',
    noun: 'employees',
    split: ['women', 'men'],
  },
  {
    key: 'orders',
    title: 'orders by city',
    totalNoun: 'orders',
    labels: ['Pune', 'Surat', 'Kochi', 'Indore', 'Patna', 'Jaipur'],
    one: 'orders from {L}',
    many: 'orders from {L}',
    noun: 'orders',
    split: ['prepaid', 'cash-on-delivery'],
  },
];

export function piePhraser(t: PieTheme): Phraser {
  const orList = (ls: string[]) => (t.key === 'sports' ? `${ls.slice(0, -1).join(', ')} or ${ls[ls.length - 1]}` : list(ls));
  return {
    noun: t.noun,
    cell: (r) => `the number of ${t.one.replace('{L}', r)}`,
    rows: (rs) => `the total number of ${t.many.replace('{L}', orList(rs))}`,
    cols: (r) => `the number of ${t.one.replace('{L}', r)}`,
    avgRows: (rs) => `the average number of ${t.many.replace('{L}', orList(rs))}`,
    avgCols: (r) => `the number of ${t.one.replace('{L}', r)}`,
    short: (r) => r,
    rowName: (r) => r,
  };
}

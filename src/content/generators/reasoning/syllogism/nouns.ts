/**
 * Everyday nouns for syllogism terms (singular / plural). Regular a/an by first letter — words where the
 * sound differs from the letter (hour, unit, university…) are deliberately left out.
 */
export interface Noun {
  s: string;
  p: string;
}

const RAW = `pen pens|book books|table tables|chair chairs|bottle bottles|glass glasses|car cars|bus buses|train trains|
flower flowers|tree trees|leaf leaves|fruit fruits|apple apples|mango mangoes|banana bananas|cup cups|plate plates|
spoon spoons|box boxes|bag bags|shoe shoes|shirt shirts|cap caps|ring rings|coin coins|note notes|wallet wallets|
phone phones|laptop laptops|key keys|lock locks|door doors|window windows|wall walls|brick bricks|stone stones|
river rivers|lake lakes|hill hills|road roads|bridge bridges|city cities|village villages|doctor doctors|
teacher teachers|singer singers|dancer dancers|actor actors|writer writers|player players|lawyer lawyers|
engineer engineers|banker bankers|clerk clerks|cat cats|dog dogs|lion lions|tiger tigers|horse horses|bird birds|
parrot parrots|pencil pencils|eraser erasers|file files|paper papers|page pages|letter letters|word words|
circle circles|square squares|triangle triangles|star stars|cloud clouds|shell shells|pearl pearls|medal medals|
kite kites|ball balls|bat bats|jar jars|pot pots|lamp lamps|fan fans|bench benches|desk desks|card cards|
stamp stamps|ticket tickets|rose roses|lily lilies|tulip tulips|grape grapes|lemon lemons|onion onions|
orange oranges|eagle eagles|owl owls|elephant elephants|umbrella umbrellas|pillow pillows|blanket blankets|
mirror mirrors|candle candles|basket baskets|bucket buckets|jacket jackets|scarf scarves|watch watches|
clock clocks|radio radios|camera cameras|drum drums|flute flutes|violin violins|guitar guitars|poet poets|
painter painters|farmer farmers|tailor tailors|pilot pilots|nurse nurses|judge judges|chef chefs|student students`;

export const NOUNS: readonly Noun[] = RAW.split('|')
  .map((x) => x.trim())
  .filter(Boolean)
  .map((x) => {
    const [s, p] = x.split(/\s+/);
    return { s, p };
  });

export function article(word: string): 'a' | 'an' {
  return /^[aeiou]/i.test(word) ? 'an' : 'a';
}

export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

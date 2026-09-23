/**
 * Curated word data for the word-based series questions (reasoning.series-pattern).
 *
 * Every list was checked offline against a ~275,000-word English list (see the chapter's final report):
 *  - FAMILIES: complete anagram families of common words. A family of one word has NO other anagram in the big
 *    list; families of two or three list every anagram an examiner would accept (only archaic / botanical /
 *    foreign strings such as "acer", "cion", "nare" were left out). Families of four or more are only ever used
 *    for "More than three" / "more than one", where extra rare words cannot change the answer.
 *  - NONE_SETS: letter multisets (sorted) with no anagram at all in the big list.
 *  - HOSTS: common words used as the source word ("the 2nd, 5th … letters of the word …"), for alphabetical
 *    rearrangement and for letter-pair questions.
 */

const words = (s: string): string[] => s.trim().split(/\s+/).map((w) => w.toUpperCase());

/** Words with no other anagram (4, 5 letters; all letters distinct). */
const UNIQUE_4 = words(`
back band bond born bulk burn cake camp chip city club come copy crew crop dark debt down drug duty exit fact
farm find firm fish five flat fort four fund gift girl give glad gold gone grew grow gulf hair half hand hang hard
harm held help holy home hope hour hung hunt jump jury kept knew land like loan lock long lord luck mark milk mind
move navy neck oral pack pair park peak pick pink plan rich safe sick size soft talk term true tune twin unit vary
very wage wait want wave wife wild wind wine wing wise wish work zero zone duck folk joke quiz dove dumb monk whip
zinc hymn bold fold bind limb comb drum flag frog harp herb horn jail lawn lung mint moth mule oath oven pint pond
pork quit sock taxi twig worm yoke`);

const UNIQUE_5 = words(`
about above agent album alive audio avoid basic beach bench black blank blind block bound brand bring brown built
cabin cable chair child climb cloth count cover crime crowd crown daily depth draft drawn drink eight empty enjoy
exact faith fault fight final fluid focus force forty forum frame fresh front fruit given glory grand grant group
guard guide heavy house human image input joint judge juice knife laugh legal light logic lucky lunch match metal
might minor mixed money month mouth movie music novel often piano pilot pitch plant pound prime print prize prove
quick rough round royal shift shirt sixth taken thank thick think track trick truck truly twice uncle unity valid
vital voice watch whole woman women world wound young youth`);

/** Complete families of two or three words. */
const SMALL_FAMILIES: string[][] = [
  // four letters, two words
  'blow bowl', 'calm clam', 'form from', 'lamp palm', 'veto vote', 'lime mile', 'note tone', 'felt left',
  'draw ward', 'keen knee', 'coin icon', 'dial laid', 'earn near', 'hate heat', 'wake weak', 'lamb balm',
  'plum lump', 'loaf foal', 'inch chin', 'line lien', 'hire heir', 'idea aide', 'mood doom', 'much chum',
  'none neon', 'once cone', 'over rove', 'pace cape', 'plug gulp', 'rent tern', 'ring grin', 'rock cork',
  'room moor', 'rule lure', 'take teak', 'thin hint', 'tool loot', 'tour rout', 'turn runt', 'wear ware',
  'went newt', 'what thaw', 'when hewn', 'wire weir', 'sour ours', 'keep peek', 'rare rear', 'golf flog',
  'zeal laze', 'lift flit', 'rely lyre', 'told dolt', 'many myna', 'page gape', 'sack cask', 'soup opus',
  // four letters, three words
  'flow fowl wolf', 'lake leak kale', 'lost lots slot', 'made dame mead', 'mode demo dome', 'pool loop polo',
  'acre care race',
  // five letters, two words
  'lemon melon', 'night thing', 'cloud could', 'grown wrong', 'north thorn', 'ought tough', 'quiet quite',
  'rival viral', 'shelf flesh', 'lured ruled', 'tired tried', 'chain china', 'tower wrote', 'outer route',
  'noted toned', 'naked knead', 'ocean canoe', 'dozen zoned', 'death hated', 'march charm', 'study dusty',
  // five letters, three words
  'below bowel elbow', 'angel angle glean', 'begin being binge', 'baker brake break', 'panel plane penal',
  'earth heart hater',
  // six letters
  'planet platen', 'airmen marine remain',
].map(words);

/** Families of four or more words (answer "More than three" / "more than one"). */
const BIG_FAMILIES: string[][] = [
  'diet edit tide tied', 'evil live veil vile', 'emit item mite time', 'amen mane mean name',
  'mate meat tame team', 'leap pale peal plea', 'post pots spot stop tops', 'part rapt tarp trap',
  'rail lair liar lira', 'arts rats star tars tsar',
  'least slate stale steal tales', 'notes onset stone tones', 'mates meats steam tames teams',
  'pears reaps spare spear parse', 'skate stake steak takes teaks', 'dater rated trade tread',
  'leapt petal plate pleat', 'share shear hares hears',
  'enlist listen silent tinsel', 'danger gander garden ranged', 'palest pastel petals plates staple',
  'canter nectar recant trance',
].map(words);

export const FAMILIES: readonly string[][] = [
  ...UNIQUE_4.map((w) => [w]),
  ...UNIQUE_5.map((w) => [w]),
  ...SMALL_FAMILIES,
  ...BIG_FAMILIES,
];

/**
 * Letter multisets (sorted, upper case) that form no English word at all. Drawn from the host words below so
 * every set can be placed at real letter positions.
 */
export const NONE_SETS: readonly string[] = words(`
aglt beov finv afow aglp bdil ikpw eluv fhlo nsuw acpw ceuv cipu biov fhit bdho
gnou afhi lptu bilv acno acnu degn acdt hinp hlor abcd hilu abuv dfru cdiv cgnu
ghiu abnp dtuw citw gipu ehtu blpu lruw ehkw efkw ciop cinr ilru acfr giop cdev
dirv finu lopv ltuv bgpu adsu bepr biru besu eopw knou efrw fghi adhp fiuv fiov
deuw stuv douv isuv egpu cdes eikw eftu ahnp ikot abgu biop degh dfgo egir acdw
cipv bghu befl aglv druw alru efhw bitu dfho irtu dhop efru cdiw fhil eltv egho
cfit gnuw klor dhnu bftu gikr efnv agpt cdgo bhno elnp bhil otuv nopv efgt afsv
aefw belv chnu bitv npru gopw efkn flnu cegt bfgi epuw aepw bdpu bfru dosv abfg
iruv egkn dekn depw abgt ilpt glot hltu bhiu gnov efsv bkot cdot fntu elrw cisu
cdel afuv bcik dghu nsuv aegk bekt eglr cdgu afip aghl fgho fgin ehit cios abcu
ahnop ilnor ikorw cdeip dhlou coptu aklot adfir efnuw aelpw belop alorw borsu abclo abops bfino
acfor cehir agitv fhisu cirtu alotw beint egktu bceos cfino befnu fhoru ilopr afnot begho coruv
efkor afipt egrtu agips cegru abgop beitv acfit eghos efinv abilv hilpu abhko afkno aditw gilot
ehnru cnopu adegh aortw goruw anorv dopuw inotv eilpw abcdu enruw elort abetw ehlor ehipw giknu
deflo afnow acosw iknot afikt eintv hiopr gnouv ceinv dfhio eflru cdopu ortuv ehktu giotv egnuw
efluv agpru cdkou eforv chiop befov aghis afinp ahorw dgilo bfiov fhlou lnoru degko afinv efruv
bciov ehkow acknu efhir ginos beiln aefnw abgik intuv acnov aintv ciorv bdhou adgir binop agipt
hilno cilop hilru binpu ghinu adehp abhot abdru`);

/** Source words: common, 6–13 letters. */
export const HOSTS: readonly string[] = words(`
absolute accident activity addition advantage agreement airplane alphabet ambition announce
anything approval argument attitude audience authority background balance bathroom beautiful
birthday blanket boundary breakfast brightness brother building business calendar campaign
candidate capacity capital champion chapter character children chocolate citizen climate
clothing college comfort commerce committee community company complaint computer conclusion
condition confidence constant contract corporate country courage creative criminal culture
customer dangerous daughter decision definite delivery democratic departure designer dictionary
different direction discovery distance document domestic education election elephant employee
envelope equation evidence example exchange exercise explain facility familiar fashion
feature festival formula fortune foundation frequent friendship furniture general generous
government graduate graphic handsome happiness harmony headline history holiday hospital
husband important incident increase industry information instant interest internet journalist
judgement keyboard kitchen knowledge language leadership library location machine magazine
management marketing material measure medicine membership minister mountain movement national
negative neighbour northern notebook objective operation opposite ordinary organise overcome
painting parliament particular passenger patience performance personal physical platform pleasure
politics popular position positive poverty practice pregnant president principal priority
prisoner problem production productive programme progress property protect publisher purchase
question rainbow reaction regional relation religion remember republic research resource
response sandwich schedule scientist secretary sentence separate shoulder signature situation
soldier something speaker specific standard stranger strength structure student subject
suddenly suggest sunlight support surface surprise teacher telephone temperature terrible
thousand together tomorrow training transport treatment tropical umbrella uniform university
vacation valuable vegetable victory village volunteer weakness weather welcome whistle
wonderful workshop yesterday documentary unforgivable troublemaking ambidextrous duplicate campground blacksmith
lumberjack complained gunpowder pathfinder subordinate thunderclap importance countryside housewife neighbourhood
atmosphere earthquake friendly november afternoon basketball bicycle cupboard daylight dolphin
downstairs elevator engineer football fountain goldfish grandmother hamburger hardware helicopter
homework honeybee horseback jellyfish lighthouse moonlight motorcycle necklace nightmare pineapple
playground rattlesnake sailboat shipwreck snowflake spaceship strawberry sunflower supermarket swimming
thunderstorm toothbrush typewriter waterfall watermelon wheelchair windmill wristwatch backpack bedroom
blackboard bookcase butterfly buttermilk classroom cowboy crossword dishwasher doorbell drumstick
eyebrow farmhouse fireworks flashlight grasshopper hairbrush handshake headphone jackfruit keyhole
landmark marketplace milestone notepad outcome paperwork passport pinwheel rainfall sawdust
scarecrow shopkeeper sideways skyscraper springboard starfish sunrise teaspoon timetable toothpaste
upstairs wallpaper warehouse weekend woodwork workplace worldwide compulsory magnitude navigation
obstacle orchestra paragraph pedestrian percentage permanent petroleum pharmacy philosophy photograph
pilgrimage plantation plumbing portrait prescription procedure profession prosperity province psychology
punctual quarterly radiation reasonable recognise refrigerator regulation reputation residence restaurant
revolution scholarship semester sequence settlement shortage similarity sovereign sponsor stadium
statement stationery strategy subsidy substance suitable superior surgery sympathy technique
territory testimony tolerance tournament tradition tragedy transfer triangle universe vacancy
variety vehicle velocity vitamin wardrobe warranty wilderness withdraw worship youthful
branches clerical banking cheque deposit discount transaction currency exporter importer
merchant mortgage treasury investor monetary economic finance insurance pension salary
budget`);

/** Sorted-letter key. */
export function letterKey(letters: readonly string[] | string): string {
  return [...letters].sort().join('');
}

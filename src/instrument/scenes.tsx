// Phase 4 — canvas scenes + the modebar. Content types only. Scene-specific
// controls (feature chips, measure, body pairings) live in the bottom play bar and
// are passed in as props; scenes here only read them. Everything renders through
// effective() (renderVarSettings) — one engine. Models ported from font-proofer.
import './scenes.css'
import { useState, useEffect, useLayoutEffect, useRef, lazy, Suspense, Fragment, type CSSProperties, type ReactNode, type KeyboardEvent } from 'react'
import { useInstrument } from './InstrumentProvider'
import { placeCaretAtStart, placeCaretAtEnd, placeCaretAtOffset, caretCharOffset, splitInlineMarkup, isPlainRun } from '../../shared/index' // wm-primitives
import { effectiveAxes, effectiveThresholds } from './store'
import { renderVarSettings, opszForSize, opszCss, compareStyle } from './render'
import { GLYPH_SETS, GLYPH_SET_KEYS, parseCmapRanges, isSupported, allGlyphsWithAlternates, type CmapRanges, type GlyphCell } from './glyphset'
import { GROUP_DEFS } from '../GlyphGroups'
import { GRID_SWAPS } from './rcltSwaps'
import { SUBS } from '../data/substitutions'
import { BOOT, type CompareSpec } from './boot'
import { effectiveLineHeightEm, capShiftEm } from './vmetrics'

export type SceneMode = 'words' | 'paragraph' | 'scale' | 'glyphs' | 'ui'
export const SCENES: { mode: SceneMode; label: string }[] = [
  { mode: 'words', label: 'Words' },
  { mode: 'paragraph', label: 'Paragraph' },
  { mode: 'scale', label: 'Scale' },
  { mode: 'glyphs', label: 'Glyphs' },
  { mode: 'ui', label: 'UI' },
]

// INFO sits in the tab row (content type), but toggles the right-side opaque overlay
// rather than replacing the content scene.
export function Modebar({ mode, setMode, showInfo, toggleInfo }: {
  mode: SceneMode; setMode: (m: SceneMode) => void
  showInfo: boolean; toggleInfo: () => void
}) {
  return (
    <div className="modebar">
      {SCENES.map(s => (
        <button key={s.mode} data-label={s.label} className={`mode-btn${mode === s.mode ? ' on' : ''}`}
          onClick={() => setMode(s.mode)}>{s.label}</button>
      ))}
      <button data-label="Info" className={`mode-btn${showInfo ? ' on' : ''}`}
        aria-pressed={showInfo} onClick={toggleInfo}>Info</button>
    </div>
  )
}

// Persistent per-scene control bar — lives in the canvas above the stage (not in
// the scroll area, so it never covers scene content). Only some scenes have controls.
export function SceneControls({ mode, source, setSource, pairs, togglePair, glyphSet, setGlyphSet }: {
  mode: SceneMode
  source: string; setSource: (s: string) => void
  pairs: Set<string>; togglePair: (k: string) => void
  glyphSet: string; setGlyphSet: (k: string) => void
}) {
  if (mode === 'glyphs') return (
    <div className="scene-bar">
      <div className="text-tabs">
        {GLYPH_SET_KEYS.map(k => (
          <button key={k} data-label={k} className={`text-tab${glyphSet === k ? ' on' : ''}`} onClick={() => setGlyphSet(k)}>{k}</button>
        ))}
      </div>
    </div>
  )
  if (mode === 'paragraph') return (
    <div className="scene-bar">
      <div className="text-tabs">
        {TEXT_SOURCES.map(k => (
          <button key={k} data-label={k} className={`text-tab${source === k ? ' on' : ''}`} onClick={() => setSource(k)}>{k}</button>
        ))}
      </div>
    </div>
  )
  if (mode === 'scale') return (
    <div className="scene-bar">
      <div className="body-pairing">
        <span className="drawer-label">Body pairing</span>
        <div className="feature-chips">
          {BODY_TIERS.map(t => (
            <button key={t.key} data-label={t.key} className={`chip${pairs.has(t.key) ? ' on' : ''}`} onClick={() => togglePair(t.key)}>{t.key}</button>
          ))}
        </div>
      </div>
    </div>
  )
  if (mode === 'ui') return (
    <div className="scene-bar">
      <span className="ui-credit">
        These are <a className="ui-credit-link" href="https://coss.com/ui" target="_blank" rel="noreferrer">COSS ui</a>
        {' '}— accessible React components on Base UI + Tailwind by <a className="ui-credit-link" href="https://github.com/pasqualevitiello" target="_blank" rel="noreferrer">Pasquale Vitiello</a>, adopted across Cal.com — rendered here in Cal Sans
      </span>
    </div>
  )
  return null
}

// TEXT_SOURCES is declared after TEXT_PRESETS below; forward use is fine (const hoist
// at module eval — SceneControls only reads it at render time).
// ── Ported data ────────────────────────────────────────────────────────────────
// Editable per-block styles (ported from font-proofer's DEFAULT_PARA_STYLES). Each
// style carries size/leading/tracking + a weight (so H1 renders bold). opsz is auto
// per block (font-optical-sizing tracks the block's size).
export type ParaStyleKey = 'h1' | 'h2' | 'h3' | 'p'
export type ParaStyle = { size: number; leading: number; tracking: number; wght: number }
export type ParaStyles = Record<ParaStyleKey, ParaStyle>
export const PARA_STYLE_ORDER: ParaStyleKey[] = ['h1', 'h2', 'h3', 'p']
export const PARA_STYLE_LABEL: Record<ParaStyleKey, string> = { h1: 'Heading 1', h2: 'Heading 2', h3: 'Heading 3', p: 'Paragraph' }
export const DEFAULT_PARA_STYLES: ParaStyles = {
  h1: { size: 57, leading: 1.1, tracking: 0, wght: 700 },
  h2: { size: 32, leading: 1.2, tracking: 0, wght: 400 },
  h3: { size: 22, leading: 1.3, tracking: 0, wght: 400 },
  p: { size: 18, leading: 1.6, tracking: 0, wght: 400 },
}

type Block = { type: ParaStyleKey; text: string }
// Full text ported from font-proofer's TEXT_PRESETS.
const TEXT_PRESETS: Record<string, Block[]> = {
  Sample: [
    { type: 'h1', text: `Hand gloves` },
    { type: 'p', text: `Typography is the art and technique of arranging type to make written language legible, readable, and appealing when displayed. The arrangement of type involves selecting typefaces, point sizes, line lengths, line-spacing, and letter-spacing, as well as adjusting the space between pairs of letters.` },
    { type: 'p', text: `The term typography is also applied to the style, arrangement, and appearance of the letters, numbers, and symbols created by the process. Type design is a closely related craft, sometimes considered part of typography.` },
  ],
  'A Tale of Two Cities': [
    { type: 'h1', text: `A Tale of Two Cities` },
    { type: 'h2', text: `Chapter I — The Period` },
    { type: 'p', text: `It was the best of times, it was the worst of times, it was the age of wisdom, it was the age of foolishness, it was the epoch of belief, it was the epoch of incredulity, it was the season of Light, it was the season of Darkness, it was the spring of hope, it was the winter of despair, we had everything before us, we had nothing before us, we were all going direct to Heaven, we were all going direct the other way—in short, the period was so far like the present period, that some of its noisiest authorities insisted on its being received, for good or for evil, in the superlative degree of comparison only.` },
    { type: 'p', text: `There were a king with a large jaw and a queen with a plain face, on the throne of England; there were a king with a large jaw and a queen with a fair face, on the throne of France. In both countries it was clearer than crystal to the lords of the State preserves of loaves and fishes, that things in general were settled for ever.` },
    { type: 'p', text: `It was the year of Our Lord one thousand seven hundred and seventy-five. Spiritual revelations were conceded to England at that favoured period, as at this. Mrs. Southcott had recently attained her five-and-twentieth blessed birthday, of whom a prophetic private in the Life Guards had heralded the sublime appearance by announcing that arrangements were made for the swallowing up of London and Westminster. Even the Cock-lane ghost had been laid only a round dozen of years, after rapping out its messages, as the spirits of this very year last past (supernaturally deficient in originality) rapped out theirs. Mere messages in the earthly order of events had lately come to the English Crown and People, from a congress of British subjects in America: which, strange to relate, have proved more important to the human race than any communications yet received through any of the chickens of the Cock-lane brood.` },
    { type: 'p', text: `France, less favoured on the whole as to matters spiritual than her sister of the shield and trident, rolled with exceeding smoothness down hill, making paper money and spending it. Under the guidance of her Christian pastors, she entertained herself, besides, with such humane achievements as sentencing a youth to have his hands cut off, his tongue torn out with pincers, and his body burned alive, because he had not kneeled down in the rain to do honour to a dirty procession of monks which passed within his view, at a distance of some fifty or sixty yards. It is likely enough that, rooted in the woods of France and Norway, there were growing trees, when that sufferer was put to death, already marked by the Woodman, Fate, to come down and be sawn into boards, to make a certain movable framework with a sack and a knife in it, terrible in history. It is likely enough that in the rough outhouses of some tillers of the heavy lands adjacent to Paris, there were sheltered from the weather that very day, rude carts, bespattered with rustic mire, snuffed about by pigs, and roosted in by poultry, which the Farmer, Death, had already set apart to be his tumbrils of the Revolution. But that Woodman and that Farmer, though they work unceasingly, work silently, and no one heard them as they went about with muffled tread: the rather, forasmuch as to entertain any suspicion that they were awake, was to be atheistical and traitorous.` },
    { type: 'p', text: `In England, there was scarcely an amount of order and protection to justify much national boasting. Daring burglaries by armed men, and highway robberies, took place in the capital itself every night; families were publicly cautioned not to go out of town without removing their furniture to upholsterers’ warehouses for security; the highwayman in the dark was a City tradesman in the light, and, being recognised and challenged by his fellow-tradesman whom he stopped in his character of “the Captain,” gallantly shot him through the head and rode away; the mail was waylaid by seven robbers, and the guard shot three dead, and then got shot dead himself by the other four, “in consequence of the failure of his ammunition:” after which the mail was robbed in peace; that magnificent potentate, the Lord Mayor of London, was made to stand and deliver on Turnham Green, by one highwayman, who despoiled the illustrious creature in sight of all his retinue; prisoners in London gaols fought battles with their turnkeys, and the majesty of the law fired blunderbusses in among them, loaded with rounds of shot and ball; thieves snipped off diamond crosses from the necks of noble lords at Court drawing-rooms; musketeers went into St. Giles’s, to search for contraband goods, and the mob fired on the musketeers, and the musketeers fired on the mob, and nobody thought any of these occurrences much out of the common way. In the midst of them, the hangman, ever busy and ever worse than useless, was in constant requisition; now, stringing up long rows of miscellaneous criminals; now, hanging a housebreaker on Saturday who had been taken on Tuesday; now, burning people in the hand at Newgate by the dozen, and now burning pamphlets at the door of Westminster Hall; to-day, taking the life of an atrocious murderer, and to-morrow of a wretched pilferer who had robbed a farmer’s boy of sixpence.` },
    { type: 'p', text: `All these things, and a thousand like them, came to pass in and close upon the dear old year one thousand seven hundred and seventy-five. Environed by them, while the Woodman and the Farmer worked unheeded, those two of the large jaws, and those other two of the plain and the fair faces, trod with stir enough, and carried their divine rights with a high hand. Thus did the year one thousand seven hundred and seventy-five conduct their Greatnesses, and myriads of small creatures—the creatures of this chronicle among the rest—along the roads that lay before them.` },
    { type: 'h2', text: `Chapter II — The Mail` },
    { type: 'p', text: `It was the Dover road that lay, on a Friday night late in November, before the first of the persons with whom this history has business. The Dover road lay, as to him, beyond the Dover mail, as it lumbered up Shooter’s Hill. He walked up hill in the mire by the side of the mail, as the rest of the passengers did; not because they had the least relish for walking exercise, under the circumstances, but because the hill, and the harness, and the mud, and the mail, were all so heavy, that the horses had three times already come to a stop, besides once drawing the coach across the road, with the mutinous intent of taking it back to Blackheath. Reins and whip and coachman and guard, however, in combination, had read that article of war which forbade a purpose otherwise strongly in favour of the argument, that some brute animals are endued with Reason; and the team had capitulated and returned to their duty.` },
    { type: 'p', text: `With drooping heads and tremulous tails, they mashed their way through the thick mud, floundering and stumbling between whiles, as if they were falling to pieces at the larger joints. As often as the driver rested them and brought them to a stand, with a wary “Wo-ho! so-ho-then!” the near leader violently shook his head and everything upon it—like an unusually emphatic horse, denying that the coach could be got up the hill. Whenever the leader made this rattle, the passenger started, as a nervous passenger might, and was disturbed in mind.` },
    { type: 'p', text: `There was a steaming mist in all the hollows, and it had roamed in its forlornness up the hill, like an evil spirit, seeking rest and finding none. A clammy and intensely cold mist, it made its slow way through the air in ripples that visibly followed and overspread one another, as the waves of an unwholesome sea might do. It was dense enough to shut out everything from the light of the coach-lamps but these its own workings, and a few yards of road; and the reek of the labouring horses steamed into it, as if they had made it all.` },
    { type: 'p', text: `Two other passengers, besides the one, were plodding up the hill by the side of the mail. All three were wrapped to the cheekbones and over the ears, and wore jack-boots. Not one of the three could have said, from anything he saw, what either of the other two was like; and each was hidden under almost as many wrappers from the eyes of the mind, as from the eyes of the body, of his two companions. In those days, travellers were very shy of being confidential on a short notice, for anybody on the road might be a robber or in league with robbers. As to the latter, when every posting-house and ale-house could produce somebody in “the Captain’s” pay, ranging from the landlord to the lowest stable non-descript, it was the likeliest thing upon the cards. So the guard of the Dover mail thought to himself, that Friday night in November, one thousand seven hundred and seventy-five, lumbering up Shooter’s Hill, as he stood on his own particular perch behind the mail, beating his feet, and keeping an eye and a hand on the arm-chest before him, where a loaded blunderbuss lay at the top of six or eight loaded horse-pistols, deposited on a substratum of cutlass.` },
    { type: 'p', text: `The Dover mail was in its usual genial position that the guard suspected the passengers, the passengers suspected one another and the guard, they all suspected everybody else, and the coachman was sure of nothing but the horses; as to which cattle he could with a clear conscience have taken his oath on the two Testaments that they were not fit for the journey.` },
    { type: 'p', text: `“Wo-ho!” said the coachman. “So, then! One more pull and you’re at the top and be damned to you, for I have had trouble enough to get you to it!—Joe!”` },
    { type: 'p', text: `“Halloa!” the guard replied.` },
    { type: 'p', text: `“What o’clock do you make it, Joe?”` },
    { type: 'p', text: `“Ten minutes, good, past eleven.”` },
    { type: 'p', text: `“My blood!” ejaculated the vexed coachman, “and not atop of Shooter’s yet! Tst! Yah! Get on with you!”` },
    { type: 'p', text: `The emphatic horse, cut short by the whip in a most decided negative, made a decided scramble for it, and the three other horses followed suit. Once more, the Dover mail struggled on, with the jack-boots of its passengers squashing along by its side. They had stopped when the coach stopped, and they kept close company with it. If any one of the three had had the hardihood to propose to another to walk on a little ahead into the mist and darkness, he would have put himself in a fair way of getting shot instantly as a highwayman.` },
    { type: 'p', text: `The last burst carried the mail to the summit of the hill. The horses stopped to breathe again, and the guard got down to skid the wheel for the descent, and open the coach-door to let the passengers in.` },
    { type: 'p', text: `“Tst! Joe!” cried the coachman in a warning voice, looking down from his box.` },
    { type: 'p', text: `“What do you say, Tom?”` },
    { type: 'p', text: `They both listened.` },
    { type: 'p', text: `“I say a horse at a canter coming up, Joe.”` },
    { type: 'p', text: `“*I* say a horse at a gallop, Tom,” returned the guard, leaving his hold of the door, and mounting nimbly to his place. “Gentlemen! In the king’s name, all of you!”` },
    { type: 'p', text: `With this hurried adjuration, he cocked his blunderbuss, and stood on the offensive.` },
    { type: 'p', text: `The passenger booked by this history, was on the coach-step, getting in; the two other passengers were close behind him, and about to follow. He remained on the step, half in the coach and half out of; they remained in the road below him. They all looked from the coachman to the guard, and from the guard to the coachman, and listened. The coachman looked back and the guard looked back, and even the emphatic leader pricked up his ears and looked back, without contradicting.` },
    { type: 'p', text: `The stillness consequent on the cessation of the rumbling and labouring of the coach, added to the stillness of the night, made it very quiet indeed. The panting of the horses communicated a tremulous motion to the coach, as if it were in a state of agitation. The hearts of the passengers beat loud enough perhaps to be heard; but at any rate, the quiet pause was audibly expressive of people out of breath, and holding the breath, and having the pulses quickened by expectation.` },
    { type: 'p', text: `The sound of a horse at a gallop came fast and furiously up the hill.` },
    { type: 'p', text: `“So-ho!” the guard sang out, as loud as he could roar. “Yo there! Stand! I shall fire!”` },
    { type: 'p', text: `The pace was suddenly checked, and, with much splashing and floundering, a man’s voice called from the mist, “Is that the Dover mail?”` },
    { type: 'p', text: `“Never you mind what it is!” the guard retorted. “What are you?”` },
    { type: 'p', text: `“*Is* that the Dover mail?”` },
    { type: 'p', text: `“Why do you want to know?”` },
    { type: 'p', text: `“I want a passenger, if it is.”` },
    { type: 'p', text: `“What passenger?”` },
    { type: 'p', text: `“Mr. Jarvis Lorry.”` },
    { type: 'p', text: `Our booked passenger showed in a moment that it was his name. The guard, the coachman, and the two other passengers eyed him distrustfully.` },
    { type: 'p', text: `“Keep where you are,” the guard called to the voice in the mist, “because, if I should make a mistake, it could never be set right in your lifetime. Gentleman of the name of Lorry answer straight.”` },
    { type: 'p', text: `“What is the matter?” asked the passenger, then, with mildly quavering speech. “Who wants me? Is it Jerry?”` },
    { type: 'p', text: `(“I don’t like Jerry’s voice, if it is Jerry,” growled the guard to himself. “He’s hoarser than suits me, is Jerry.”)` },
    { type: 'p', text: `“Yes, Mr. Lorry.”` },
    { type: 'p', text: `“What is the matter?”` },
    { type: 'p', text: `“A despatch sent after you from over yonder. T. and Co.”` },
    { type: 'p', text: `“I know this messenger, guard,” said Mr. Lorry, getting down into the road—assisted from behind more swiftly than politely by the other two passengers, who immediately scrambled into the coach, shut the door, and pulled up the window. “He may come close; there’s nothing wrong.”` },
    { type: 'p', text: `“I hope there ain’t, but I can’t make so ’Nation sure of that,” said the guard, in gruff soliloquy. “Hallo you!”` },
    { type: 'p', text: `“Well! And hallo you!” said Jerry, more hoarsely than before.` },
    { type: 'p', text: `“Come on at a footpace! d’ye mind me? And if you’ve got holsters to that saddle o’ yourn, don’t let me see your hand go nigh ’em. For I’m a devil at a quick mistake, and when I make one it takes the form of Lead. So now let’s look at you.”` },
    { type: 'p', text: `The figures of a horse and rider came slowly through the eddying mist, and came to the side of the mail, where the passenger stood. The rider stooped, and, casting up his eyes at the guard, handed the passenger a small folded paper. The rider’s horse was blown, and both horse and rider were covered with mud, from the hoofs of the horse to the hat of the man.` },
    { type: 'p', text: `“Guard!” said the passenger, in a tone of quiet business confidence.` },
    { type: 'p', text: `The watchful guard, with his right hand at the stock of his raised blunderbuss, his left at the barrel, and his eye on the horseman, answered curtly, “Sir.”` },
    { type: 'p', text: `“There is nothing to apprehend. I belong to Tellson’s Bank. You must know Tellson’s Bank in London. I am going to Paris on business. A crown to drink. I may read this?”` },
    { type: 'p', text: `“If so be as you’re quick, sir.”` },
    { type: 'p', text: `He opened it in the light of the coach-lamp on that side, and read—first to himself and then aloud: “‘Wait at Dover for Mam’selle.’ It’s not long, you see, guard. Jerry, say that my answer was, *Recalled to life*.”` },
    { type: 'p', text: `Jerry started in his saddle. “That’s a Blazing strange answer, too,” said he, at his hoarsest.` },
    { type: 'p', text: `“Take that message back, and they will know that I received this, as well as if I wrote. Make the best of your way. Good night.”` },
    { type: 'p', text: `With those words the passenger opened the coach-door and got in; not at all assisted by his fellow-passengers, who had expeditiously secreted their watches and purses in their boots, and were now making a general pretence of being asleep. With no more definite purpose than to escape the hazard of originating any other kind of action.` },
    { type: 'p', text: `The coach lumbered on again, with heavier wreaths of mist closing round it as it began the descent. The guard soon replaced his blunderbuss in his arm-chest, and, having looked to the rest of its contents, and having looked to the supplementary pistols that he wore in his belt, looked to a smaller chest beneath his seat, in which there were a few smith’s tools, a couple of torches, and a tinder-box. For he was furnished with that completeness that if the coach-lamps had been blown and stormed out, which did occasionally happen, he had only to shut himself up inside, keep the flint and steel sparks well off the straw, and get a light with tolerable safety and ease (if he were lucky) in five minutes.` },
    { type: 'p', text: `“Tom!” softly over the coach roof.` },
    { type: 'p', text: `“Hallo, Joe.”` },
    { type: 'p', text: `“Did you hear the message?”` },
    { type: 'p', text: `“I did, Joe.”` },
    { type: 'p', text: `“What did you make of it, Tom?”` },
    { type: 'p', text: `“Nothing at all, Joe.”` },
    { type: 'p', text: `“That’s a coincidence, too,” the guard mused, “for I made the same of it myself.”` },
    { type: 'p', text: `Jerry, left alone in the mist and darkness, dismounted meanwhile, not only to ease his spent horse, but to wipe the mud from his face, and shake the wet out of his hat-brim, which might be capable of holding about half a gallon. After standing with the bridle over his heavily-splashed arm, until the wheels of the mail were no longer within hearing and the night was quite still again, he turned to walk down the hill.` },
    { type: 'p', text: `“After that there gallop from Temple Bar, old lady, I won’t trust your fore-legs till I get you on the level,” said this hoarse messenger, glancing at his mare. “‘Recalled to life.’ That’s a Blazing strange message. Much of that wouldn’t do for you, Jerry! I say, Jerry! You’d be in a Blazing bad way, if recalling to life was to come into fashion, Jerry!”` },
    { type: 'h2', text: `Chapter III — The Night Shadows` },
    { type: 'p', text: `A wonderful fact to reflect upon, that every human creature is constituted to be that profound secret and mystery to every other. A solemn consideration, when I enter a great city by night, that every one of those darkly clustered houses encloses its own secret; that every room in every one of them encloses its own secret; that every beating heart in the hundreds of thousands of breasts there, is, in some of its imaginings, a secret to the heart nearest it! Something of the awfulness, even of Death itself, is referable to this. No more can I turn the leaves of this dear book that I loved, and vainly hope in time to read it all. No more can I look into the depths of this unfathomable water, wherein, as momentary lights glanced into it, I have had glimpses of buried treasure and other things submerged. It was appointed that the book should shut with a spring, for ever and for ever, when I had read but a page. It was appointed that the water should be locked in an eternal frost, when the light was playing on its surface, and I stood in ignorance on the shore. My friend is dead, my neighbour is dead, my love, the darling of my soul, is dead; it is the inexorable consolidation and perpetuation of the secret that was always in that individuality, and which I shall carry in mine to my life’s end. In any of the burial-places of this city through which I pass, is there a sleeper more inscrutable than its busy inhabitants are, in their innermost personality, to me, or than I am to them?` },
    { type: 'p', text: `As to this, his natural and not to be alienated inheritance, the messenger on horseback had exactly the same possessions as the King, the first Minister of State, or the richest merchant in London. So with the three passengers shut up in the narrow compass of one lumbering old mail coach; they were mysteries to one another, as complete as if each had been in his own coach and six, or his own coach and sixty, with the breadth of a county between him and the next.` },
    { type: 'p', text: `The messenger rode back at an easy trot, stopping pretty often at ale-houses by the way to drink, but evincing a tendency to keep his own counsel, and to keep his hat cocked over his eyes. He had eyes that assorted very well with that decoration, being of a surface black, with no depth in the colour or form, and much too near together—as if they were afraid of being found out in something, singly, if they kept too far apart. They had a sinister expression, under an old cocked-hat like a three-cornered spittoon, and over a great muffler for the chin and throat, which descended nearly to the wearer’s knees. When he stopped for drink, he moved this muffler with his left hand, only while he poured his liquor in with his right; as soon as that was done, he muffled again.` },
    { type: 'p', text: `“No, Jerry, no!” said the messenger, harping on one theme as he rode. “It wouldn’t do for you, Jerry. Jerry, you honest tradesman, it wouldn’t suit *your* line of business! Recalled—! Bust me if I don’t think he’d been a drinking!”` },
    { type: 'p', text: `His message perplexed his mind to that degree that he was fain, several times, to take off his hat to scratch his head. Except on the crown, which was raggedly bald, he had stiff, black hair, standing jaggedly all over it, and growing down hill almost to his broad, blunt nose. It was so like Smith’s work, so much more like the top of a strongly spiked wall than a head of hair, that the best of players at leap-frog might have declined him, as the most dangerous man in the world to go over.` },
    { type: 'p', text: `While he trotted back with the message he was to deliver to the night watchman in his box at the door of Tellson’s Bank, by Temple Bar, who was to deliver it to greater authorities within, the shadows of the night took such shapes to him as arose out of the message, and took such shapes to the mare as arose out of *her* private topics of uneasiness. They seemed to be numerous, for she shied at every shadow on the road.` },
    { type: 'p', text: `What time, the mail-coach lumbered, jolted, rattled, and bumped upon its tedious way, with its three fellow-inscrutables inside. To whom, likewise, the shadows of the night revealed themselves, in the forms their dozing eyes and wandering thoughts suggested.` },
    { type: 'p', text: `Tellson’s Bank had a run upon it in the mail. As the bank passenger—with an arm drawn through the leathern strap, which did what lay in it to keep him from pounding against the next passenger, and driving him into his corner, whenever the coach got a special jolt—nodded in his place, with half-shut eyes, the little coach-windows, and the coach-lamp dimly gleaming through them, and the bulky bundle of opposite passenger, became the bank, and did a great stroke of business. The rattle of the harness was the chink of money, and more drafts were honoured in five minutes than even Tellson’s, with all its foreign and home connection, ever paid in thrice the time. Then the strong-rooms underground, at Tellson’s, with such of their valuable stores and secrets as were known to the passenger (and it was not a little that he knew about them), opened before him, and he went in among them with the great keys and the feebly-burning candle, and found them safe, and strong, and sound, and still, just as he had last seen them.` },
    { type: 'p', text: `But, though the bank was almost always with him, and though the coach (in a confused way, like the presence of pain under an opiate) was always with him, there was another current of impression that never ceased to run, all through the night. He was on his way to dig some one out of a grave.` },
    { type: 'p', text: `Now, which of the multitude of faces that showed themselves before him was the true face of the buried person, the shadows of the night did not indicate; but they were all the faces of a man of five-and-forty by years, and they differed principally in the passions they expressed, and in the ghastliness of their worn and wasted state. Pride, contempt, defiance, stubbornness, submission, lamentation, succeeded one another; so did varieties of sunken cheek, cadaverous colour, emaciated hands and figures. But the face was in the main one face, and every head was prematurely white. A hundred times the dozing passenger inquired of this spectre:` },
    { type: 'p', text: `“Buried how long?”` },
    { type: 'p', text: `The answer was always the same: “Almost eighteen years.”` },
    { type: 'p', text: `“You had abandoned all hope of being dug out?”` },
    { type: 'p', text: `“Long ago.”` },
    { type: 'p', text: `“You know that you are recalled to life?”` },
    { type: 'p', text: `“They tell me so.”` },
    { type: 'p', text: `“I hope you care to live?”` },
    { type: 'p', text: `“I can’t say.”` },
    { type: 'p', text: `“Shall I show her to you? Will you come and see her?”` },
    { type: 'p', text: `The answers to this question were various and contradictory. Sometimes the broken reply was, “Wait! It would kill me if I saw her too soon.” Sometimes, it was given in a tender rain of tears, and then it was, “Take me to her.” Sometimes it was staring and bewildered, and then it was, “I don’t know her. I don’t understand.”` },
    { type: 'p', text: `After such imaginary discourse, the passenger in his fancy would dig, and dig, dig—now with a spade, now with a great key, now with his hands—to dig this wretched creature out. Got out at last, with earth hanging about his face and hair, he would suddenly fan away to dust. The passenger would then start to himself, and lower the window, to get the reality of mist and rain on his cheek.` },
    { type: 'p', text: `Yet even when his eyes were opened on the mist and rain, on the moving patch of light from the lamps, and the hedge at the roadside retreating by jerks, the night shadows outside the coach would fall into the train of the night shadows within. The real Banking-house by Temple Bar, the real business of the past day, the real strong rooms, the real express sent after him, and the real message returned, would all be there. Out of the midst of them, the ghostly face would rise, and he would accost it again.` },
    { type: 'p', text: `“Buried how long?”` },
    { type: 'p', text: `“Almost eighteen years.”` },
    { type: 'p', text: `“I hope you care to live?”` },
    { type: 'p', text: `“I can’t say.”` },
    { type: 'p', text: `Dig—dig—dig—until an impatient movement from one of the two passengers would admonish him to pull up the window, draw his arm securely through the leathern strap, and speculate upon the two slumbering forms, until his mind lost its hold of them, and they again slid away into the bank and the grave.` },
    { type: 'p', text: `“Buried how long?”` },
    { type: 'p', text: `“Almost eighteen years.”` },
    { type: 'p', text: `“You had abandoned all hope of being dug out?”` },
    { type: 'p', text: `“Long ago.”` },
    { type: 'p', text: `The words were still in his hearing as just spoken—distinctly in his hearing as ever spoken words had been in his life—when the weary passenger started to the consciousness of daylight, and found that the shadows of the night were gone.` },
    { type: 'p', text: `He lowered the window, and looked out at the rising sun. There was a ridge of ploughed land, with a plough upon it where it had been left last night when the horses were unyoked; beyond, a quiet coppice-wood, in which many leaves of burning red and golden yellow still remained upon the trees. Though the earth was cold and wet, the sky was clear, and the sun rose bright, placid, and beautiful.` },
    { type: 'p', text: `“Eighteen years!” said the passenger, looking at the sun. “Gracious Creator of day! To be buried alive for eighteen years!”` },
    { type: 'h2', text: `Chapter IV — The Preparation` },
    { type: 'p', text: `When the mail got successfully to Dover, in the course of the forenoon, the head drawer at the Royal George Hotel opened the coach-door as his custom was. He did it with some flourish of ceremony, for a mail journey from London in winter was an achievement to congratulate an adventurous traveller upon.` },
    { type: 'p', text: `By that time, there was only one adventurous traveller left be congratulated: for the two others had been set down at their respective roadside destinations. The mildewy inside of the coach, with its damp and dirty straw, its disagreeable smell, and its obscurity, was rather like a larger dog-kennel. Mr. Lorry, the passenger, shaking himself out of it in chains of straw, a tangle of shaggy wrapper, flapping hat, and muddy legs, was rather like a larger sort of dog.` },
    { type: 'p', text: `“There will be a packet to Calais, tomorrow, drawer?”` },
    { type: 'p', text: `“Yes, sir, if the weather holds and the wind sets tolerable fair. The tide will serve pretty nicely at about two in the afternoon, sir. Bed, sir?”` },
    { type: 'p', text: `“I shall not go to bed till night; but I want a bedroom, and a barber.”` },
    { type: 'p', text: `“And then breakfast, sir? Yes, sir. That way, sir, if you please. Show Concord! Gentleman’s valise and hot water to Concord. Pull off gentleman’s boots in Concord. (You will find a fine sea-coal fire, sir.) Fetch barber to Concord. Stir about there, now, for Concord!”` },
    { type: 'p', text: `The Concord bed-chamber being always assigned to a passenger by the mail, and passengers by the mail being always heavily wrapped up from head to foot, the room had the odd interest for the establishment of the Royal George, that although but one kind of man was seen to go into it, all kinds and varieties of men came out of it. Consequently, another drawer, and two porters, and several maids and the landlady, were all loitering by accident at various points of the road between the Concord and the coffee-room, when a gentleman of sixty, formally dressed in a brown suit of clothes, pretty well worn, but very well kept, with large square cuffs and large flaps to the pockets, passed along on his way to his breakfast.` },
    { type: 'p', text: `The coffee-room had no other occupant, that forenoon, than the gentleman in brown. His breakfast-table was drawn before the fire, and as he sat, with its light shining on him, waiting for the meal, he sat so still, that he might have been sitting for his portrait.` },
    { type: 'p', text: `Very orderly and methodical he looked, with a hand on each knee, and a loud watch ticking a sonorous sermon under his flapped waist-coat, as though it pitted its gravity and longevity against the levity and evanescence of the brisk fire. He had a good leg, and was a little vain of it, for his brown stockings fitted sleek and close, and were of a fine texture; his shoes and buckles, too, though plain, were trim. He wore an odd little sleek crisp flaxen wig, setting very close to his head: which wig, it is to be presumed, was made of hair, but which looked far more as though it were spun from filaments of silk or glass. His linen, though not of a fineness in accordance with his stockings, was as white as the tops of the waves that broke upon the neighbouring beach, or the specks of sail that glinted in the sunlight far at sea. A face habitually suppressed and quieted, was still lighted up under the quaint wig by a pair of moist bright eyes that it must have cost their owner, in years gone by, some pains to drill to the composed and reserved expression of Tellson’s Bank. He had a healthy colour in his cheeks, and his face, though lined, bore few traces of anxiety. But, perhaps the confidential bachelor clerks in Tellson’s Bank were principally occupied with the cares of other people; and perhaps second-hand cares, like second-hand clothes, come easily off and on.` },
    { type: 'p', text: `Completing his resemblance to a man who was sitting for his portrait, Mr. Lorry dropped off to sleep. The arrival of his breakfast roused him, and he said to the drawer, as he moved his chair to it:` },
    { type: 'p', text: `“I wish accommodation prepared for a young lady who may come here at any time to-day. She may ask for Mr. Jarvis Lorry, or she may only ask for a gentleman from Tellson’s Bank. Please to let me know.”` },
    { type: 'p', text: `“Yes, sir. Tellson’s Bank in London, sir?”` },
    { type: 'p', text: `“Yes.”` },
    { type: 'p', text: `“Yes, sir. We have oftentimes the honour to entertain your gentlemen in their travelling backwards and forwards betwixt London and Paris, sir. A vast deal of travelling, sir, in Tellson and Company’s House.”` },
    { type: 'p', text: `“Yes. We are quite a French House, as well as an English one.”` },
    { type: 'p', text: `“Yes, sir. Not much in the habit of such travelling yourself, I think, sir?”` },
    { type: 'p', text: `“Not of late years. It is fifteen years since we—since I—came last from France.”` },
    { type: 'p', text: `“Indeed, sir? That was before my time here, sir. Before our people’s time here, sir. The George was in other hands at that time, sir.”` },
    { type: 'p', text: `“I believe so.”` },
    { type: 'p', text: `“But I would hold a pretty wager, sir, that a House like Tellson and Company was flourishing, a matter of fifty, not to speak of fifteen years ago?”` },
    { type: 'p', text: `“You might treble that, and say a hundred and fifty, yet not be far from the truth.”` },
    { type: 'p', text: `“Indeed, sir!”` },
    { type: 'p', text: `Rounding his mouth and both his eyes, as he stepped backward from the table, the waiter shifted his napkin from his right arm to his left, dropped into a comfortable attitude, and stood surveying the guest while he ate and drank, as from an observatory or watchtower. According to the immemorial usage of waiters in all ages.` },
    { type: 'p', text: `When Mr. Lorry had finished his breakfast, he went out for a stroll on the beach. The little narrow, crooked town of Dover hid itself away from the beach, and ran its head into the chalk cliffs, like a marine ostrich. The beach was a desert of heaps of sea and stones tumbling wildly about, and the sea did what it liked, and what it liked was destruction. It thundered at the town, and thundered at the cliffs, and brought the coast down, madly. The air among the houses was of so strong a piscatory flavour that one might have supposed sick fish went up to be dipped in it, as sick people went down to be dipped in the sea. A little fishing was done in the port, and a quantity of strolling about by night, and looking seaward: particularly at those times when the tide made, and was near flood. Small tradesmen, who did no business whatever, sometimes unaccountably realised large fortunes, and it was remarkable that nobody in the neighbourhood could endure a lamplighter.` },
    { type: 'p', text: `As the day declined into the afternoon, and the air, which had been at intervals clear enough to allow the French coast to be seen, became again charged with mist and vapour, Mr. Lorry’s thoughts seemed to cloud too. When it was dark, and he sat before the coffee-room fire, awaiting his dinner as he had awaited his breakfast, his mind was busily digging, digging, digging, in the live red coals.` },
    { type: 'p', text: `A bottle of good claret after dinner does a digger in the red coals no harm, otherwise than as it has a tendency to throw him out of work. Mr. Lorry had been idle a long time, and had just poured out his last glassful of wine with as complete an appearance of satisfaction as is ever to be found in an elderly gentleman of a fresh complexion who has got to the end of a bottle, when a rattling of wheels came up the narrow street, and rumbled into the inn-yard.` },
    { type: 'p', text: `He set down his glass untouched. “This is Mam’selle!” said he.` },
    { type: 'p', text: `In a very few minutes the waiter came in to announce that Miss Manette had arrived from London, and would be happy to see the gentleman from Tellson’s.` },
    { type: 'p', text: `“So soon?”` },
    { type: 'p', text: `Miss Manette had taken some refreshment on the road, and required none then, and was extremely anxious to see the gentleman from Tellson’s immediately, if it suited his pleasure and convenience.` },
    { type: 'p', text: `The gentleman from Tellson’s had nothing left for it but to empty his glass with an air of stolid desperation, settle his odd little flaxen wig at the ears, and follow the waiter to Miss Manette’s apartment. It was a large, dark room, furnished in a funereal manner with black horsehair, and loaded with heavy dark tables. These had been oiled and oiled, until the two tall candles on the table in the middle of the room were gloomily reflected on every leaf; as if *they* were buried, in deep graves of black mahogany, and no light to speak of could be expected from them until they were dug out.` },
    { type: 'p', text: `The obscurity was so difficult to penetrate that Mr. Lorry, picking his way over the well-worn Turkey carpet, supposed Miss Manette to be, for the moment, in some adjacent room, until, having got past the two tall candles, he saw standing to receive him by the table between them and the fire, a young lady of not more than seventeen, in a riding-cloak, and still holding her straw travelling-hat by its ribbon in her hand. As his eyes rested on a short, slight, pretty figure, a quantity of golden hair, a pair of blue eyes that met his own with an inquiring look, and a forehead with a singular capacity (remembering how young and smooth it was), of rifting and knitting itself into an expression that was not quite one of perplexity, or wonder, or alarm, or merely of a bright fixed attention, though it included all the four expressions—as his eyes rested on these things, a sudden vivid likeness passed before him, of a child whom he had held in his arms on the passage across that very Channel, one cold time, when the hail drifted heavily and the sea ran high. The likeness passed away, like a breath along the surface of the gaunt pier-glass behind her, on the frame of which, a hospital procession of negro cupids, several headless and all cripples, were offering black baskets of Dead Sea fruit to black divinities of the feminine gender—and he made his formal bow to Miss Manette.` },
    { type: 'p', text: `“Pray take a seat, sir.” In a very clear and pleasant young voice; a little foreign in its accent, but a very little indeed.` },
    { type: 'p', text: `“I kiss your hand, miss,” said Mr. Lorry, with the manners of an earlier date, as he made his formal bow again, and took his seat.` },
    { type: 'p', text: `“I received a letter from the Bank, sir, yesterday, informing me that some intelligence—or discovery—”` },
    { type: 'p', text: `“The word is not material, miss; either word will do.”` },
    { type: 'p', text: `“—respecting the small property of my poor father, whom I never saw—so long dead—”` },
    { type: 'p', text: `Mr. Lorry moved in his chair, and cast a troubled look towards the hospital procession of negro cupids. As if *they* had any help for anybody in their absurd baskets!` },
    { type: 'p', text: `“—rendered it necessary that I should go to Paris, there to communicate with a gentleman of the Bank, so good as to be despatched to Paris for the purpose.”` },
    { type: 'p', text: `“Myself.”` },
    { type: 'p', text: `“As I was prepared to hear, sir.”` },
    { type: 'p', text: `She curtseyed to him (young ladies made curtseys in those days), with a pretty desire to convey to him that she felt how much older and wiser he was than she. He made her another bow.` },
    { type: 'p', text: `“I replied to the Bank, sir, that as it was considered necessary, by those who know, and who are so kind as to advise me, that I should go to France, and that as I am an orphan and have no friend who could go with me, I should esteem it highly if I might be permitted to place myself, during the journey, under that worthy gentleman’s protection. The gentleman had left London, but I think a messenger was sent after him to beg the favour of his waiting for me here.”` },
    { type: 'p', text: `“I was happy,” said Mr. Lorry, “to be entrusted with the charge. I shall be more happy to execute it.”` },
    { type: 'p', text: `“Sir, I thank you indeed. I thank you very gratefully. It was told me by the Bank that the gentleman would explain to me the details of the business, and that I must prepare myself to find them of a surprising nature. I have done my best to prepare myself, and I naturally have a strong and eager interest to know what they are.”` },
    { type: 'p', text: `“Naturally,” said Mr. Lorry. “Yes—I—”` },
    { type: 'p', text: `After a pause, he added, again settling the crisp flaxen wig at the ears, “It is very difficult to begin.”` },
    { type: 'p', text: `He did not begin, but, in his indecision, met her glance. The young forehead lifted itself into that singular expression—but it was pretty and characteristic, besides being singular—and she raised her hand, as if with an involuntary action she caught at, or stayed some passing shadow.` },
    { type: 'p', text: `“Are you quite a stranger to me, sir?”` },
    { type: 'p', text: `“Am I not?” Mr. Lorry opened his hands, and extended them outwards with an argumentative smile.` },
    { type: 'p', text: `Between the eyebrows and just over the little feminine nose, the line of which was as delicate and fine as it was possible to be, the expression deepened itself as she took her seat thoughtfully in the chair by which she had hitherto remained standing. He watched her as she mused, and the moment she raised her eyes again, went on:` },
    { type: 'p', text: `“In your adopted country, I presume, I cannot do better than address you as a young English lady, Miss Manette?”` },
    { type: 'p', text: `“If you please, sir.”` },
    { type: 'p', text: `“Miss Manette, I am a man of business. I have a business charge to acquit myself of. In your reception of it, don’t heed me any more than if I was a speaking machine—truly, I am not much else. I will, with your leave, relate to you, miss, the story of one of our customers.”` },
    { type: 'p', text: `“Story!”` },
    { type: 'p', text: `He seemed wilfully to mistake the word she had repeated, when he added, in a hurry, “Yes, customers; in the banking business we usually call our connection our customers. He was a French gentleman; a scientific gentleman; a man of great acquirements—a Doctor.”` },
    { type: 'p', text: `“Not of Beauvais?”` },
    { type: 'p', text: `“Why, yes, of Beauvais. Like Monsieur Manette, your father, the gentleman was of Beauvais. Like Monsieur Manette, your father, the gentleman was of repute in Paris. I had the honour of knowing him there. Our relations were business relations, but confidential. I was at that time in our French House, and had been—oh! twenty years.”` },
    { type: 'p', text: `“At that time—I may ask, at what time, sir?”` },
    { type: 'p', text: `“I speak, miss, of twenty years ago. He married—an English lady—and I was one of the trustees. His affairs, like the affairs of many other French gentlemen and French families, were entirely in Tellson’s hands. In a similar way I am, or I have been, trustee of one kind or other for scores of our customers. These are mere business relations, miss; there is no friendship in them, no particular interest, nothing like sentiment. I have passed from one to another, in the course of my business life, just as I pass from one of our customers to another in the course of my business day; in short, I have no feelings; I am a mere machine. To go on—”` },
    { type: 'p', text: `“But this is my father’s story, sir; and I begin to think”—the curiously roughened forehead was very intent upon him—“that when I was left an orphan through my mother’s surviving my father only two years, it was you who brought me to England. I am almost sure it was you.”` },
    { type: 'p', text: `Mr. Lorry took the hesitating little hand that confidingly advanced to take his, and he put it with some ceremony to his lips. He then conducted the young lady straightway to her chair again, and, holding the chair-back with his left hand, and using his right by turns to rub his chin, pull his wig at the ears, or point what he said, stood looking down into her face while she sat looking up into his.` },
    { type: 'p', text: `“Miss Manette, it *was* I. And you will see how truly I spoke of myself just now, in saying I had no feelings, and that all the relations I hold with my fellow-creatures are mere business relations, when you reflect that I have never seen you since. No; you have been the ward of Tellson’s House since, and I have been busy with the other business of Tellson’s House since. Feelings! I have no time for them, no chance of them. I pass my whole life, miss, in turning an immense pecuniary Mangle.”` },
    { type: 'p', text: `After this odd description of his daily routine of employment, Mr. Lorry flattened his flaxen wig upon his head with both hands (which was most unnecessary, for nothing could be flatter than its shining surface was before), and resumed his former attitude.` },
    { type: 'p', text: `“So far, miss (as you have remarked), this is the story of your regretted father. Now comes the difference. If your father had not died when he did—Don’t be frightened! How you start!”` },
    { type: 'p', text: `She did, indeed, start. And she caught his wrist with both her hands.` },
    { type: 'p', text: `“Pray,” said Mr. Lorry, in a soothing tone, bringing his left hand from the back of the chair to lay it on the supplicatory fingers that clasped him in so violent a tremble: “pray control your agitation—a matter of business. As I was saying—”` },
    { type: 'p', text: `Her look so discomposed him that he stopped, wandered, and began anew:` },
    { type: 'p', text: `“As I was saying; if Monsieur Manette had not died; if he had suddenly and silently disappeared; if he had been spirited away; if it had not been difficult to guess to what dreadful place, though no art could trace him; if he had an enemy in some compatriot who could exercise a privilege that I in my own time have known the boldest people afraid to speak of in a whisper, across the water there; for instance, the privilege of filling up blank forms for the consignment of any one to the oblivion of a prison for any length of time; if his wife had implored the king, the queen, the court, the clergy, for any tidings of him, and all quite in vain;—then the history of your father would have been the history of this unfortunate gentleman, the Doctor of Beauvais.”` },
    { type: 'p', text: `“I entreat you to tell me more, sir.”` },
    { type: 'p', text: `“I will. I am going to. You can bear it?”` },
    { type: 'p', text: `“I can bear anything but the uncertainty you leave me in at this moment.”` },
    { type: 'p', text: `“You speak collectedly, and you—*are* collected. That’s good!” (Though his manner was less satisfied than his words.) “A matter of business. Regard it as a matter of business—business that must be done. Now if this doctor’s wife, though a lady of great courage and spirit, had suffered so intensely from this cause before her little child was born—”` },
    { type: 'p', text: `“The little child was a daughter, sir.”` },
    { type: 'p', text: `“A daughter. A-a-matter of business—don’t be distressed. Miss, if the poor lady had suffered so intensely before her little child was born, that she came to the determination of sparing the poor child the inheritance of any part of the agony she had known the pains of, by rearing her in the belief that her father was dead—No, don’t kneel! In Heaven’s name why should you kneel to me!”` },
    { type: 'p', text: `“For the truth. O dear, good, compassionate sir, for the truth!”` },
    { type: 'p', text: `“A—a matter of business. You confuse me, and how can I transact business if I am confused? Let us be clear-headed. If you could kindly mention now, for instance, what nine times ninepence are, or how many shillings in twenty guineas, it would be so encouraging. I should be so much more at my ease about your state of mind.”` },
    { type: 'p', text: `Without directly answering to this appeal, she sat so still when he had very gently raised her, and the hands that had not ceased to clasp his wrists were so much more steady than they had been, that she communicated some reassurance to Mr. Jarvis Lorry.` },
    { type: 'p', text: `“That’s right, that’s right. Courage! Business! You have business before you; useful business. Miss Manette, your mother took this course with you. And when she died—I believe broken-hearted—having never slackened her unavailing search for your father, she left you, at two years old, to grow to be blooming, beautiful, and happy, without the dark cloud upon you of living in uncertainty whether your father soon wore his heart out in prison, or wasted there through many lingering years.”` },
    { type: 'p', text: `As he said the words he looked down, with an admiring pity, on the flowing golden hair; as if he pictured to himself that it might have been already tinged with grey.` },
    { type: 'p', text: `“You know that your parents had no great possession, and that what they had was secured to your mother and to you. There has been no new discovery, of money, or of any other property; but—”` },
    { type: 'p', text: `He felt his wrist held closer, and he stopped. The expression in the forehead, which had so particularly attracted his notice, and which was now immovable, had deepened into one of pain and horror.` },
    { type: 'p', text: `“But he has been—been found. He is alive. Greatly changed, it is too probable; almost a wreck, it is possible; though we will hope the best. Still, alive. Your father has been taken to the house of an old servant in Paris, and we are going there: I, to identify him if I can: you, to restore him to life, love, duty, rest, comfort.”` },
    { type: 'p', text: `A shiver ran through her frame, and from it through his. She said, in a low, distinct, awe-stricken voice, as if she were saying it in a dream,` },
    { type: 'p', text: `“I am going to see his Ghost! It will be his Ghost—not him!”` },
    { type: 'p', text: `Mr. Lorry quietly chafed the hands that held his arm. “There, there, there! See now, see now! The best and the worst are known to you, now. You are well on your way to the poor wronged gentleman, and, with a fair sea voyage, and a fair land journey, you will be soon at his dear side.”` },
    { type: 'p', text: `She repeated in the same tone, sunk to a whisper, “I have been free, I have been happy, yet his Ghost has never haunted me!”` },
    { type: 'p', text: `“Only one thing more,” said Mr. Lorry, laying stress upon it as a wholesome means of enforcing her attention: “he has been found under another name; his own, long forgotten or long concealed. It would be worse than useless now to inquire which; worse than useless to seek to know whether he has been for years overlooked, or always designedly held prisoner. It would be worse than useless now to make any inquiries, because it would be dangerous. Better not to mention the subject, anywhere or in any way, and to remove him—for a while at all events—out of France. Even I, safe as an Englishman, and even Tellson’s, important as they are to French credit, avoid all naming of the matter. I carry about me, not a scrap of writing openly referring to it. This is a secret service altogether. My credentials, entries, and memoranda, are all comprehended in the one line, ‘Recalled to Life;’ which may mean anything. But what is the matter! She doesn’t notice a word! Miss Manette!”` },
    { type: 'p', text: `Perfectly still and silent, and not even fallen back in her chair, she sat under his hand, utterly insensible; with her eyes open and fixed upon him, and with that last expression looking as if it were carved or branded into her forehead. So close was her hold upon his arm, that he feared to detach himself lest he should hurt her; therefore he called out loudly for assistance without moving.` },
    { type: 'p', text: `A wild-looking woman, whom even in his agitation, Mr. Lorry observed to be all of a red colour, and to have red hair, and to be dressed in some extraordinary tight-fitting fashion, and to have on her head a most wonderful bonnet like a Grenadier wooden measure, and good measure too, or a great Stilton cheese, came running into the room in advance of the inn servants, and soon settled the question of his detachment from the poor young lady, by laying a brawny hand upon his chest, and sending him flying back against the nearest wall.` },
    { type: 'p', text: `(“I really think this must be a man!” was Mr. Lorry’s breathless reflection, simultaneously with his coming against the wall.)` },
    { type: 'p', text: `“Why, look at you all!” bawled this figure, addressing the inn servants. “Why don’t you go and fetch things, instead of standing there staring at me? I am not so much to look at, am I? Why don’t you go and fetch things? I’ll let you know, if you don’t bring smelling-salts, cold water, and vinegar, quick, I will.”` },
    { type: 'p', text: `There was an immediate dispersal for these restoratives, and she softly laid the patient on a sofa, and tended her with great skill and gentleness: calling her “my precious!” and “my bird!” and spreading her golden hair aside over her shoulders with great pride and care.` },
    { type: 'p', text: `“And you in brown!” she said, indignantly turning to Mr. Lorry; “couldn’t you tell her what you had to tell her, without frightening her to death? Look at her, with her pretty pale face and her cold hands. Do you call *that* being a Banker?”` },
    { type: 'p', text: `Mr. Lorry was so exceedingly disconcerted by a question so hard to answer, that he could only look on, at a distance, with much feebler sympathy and humility, while the strong woman, having banished the inn servants under the mysterious penalty of “letting them know” something not mentioned if they stayed there, staring, recovered her charge by a regular series of gradations, and coaxed her to lay her drooping head upon her shoulder.` },
    { type: 'p', text: `“I hope she will do well now,” said Mr. Lorry.` },
    { type: 'p', text: `“No thanks to you in brown, if she does. My darling pretty!”` },
    { type: 'p', text: `“I hope,” said Mr. Lorry, after another pause of feeble sympathy and humility, “that you accompany Miss Manette to France?”` },
    { type: 'p', text: `“A likely thing, too!” replied the strong woman. “If it was ever intended that I should go across salt water, do you suppose Providence would have cast my lot in an island?”` },
    { type: 'p', text: `This being another question hard to answer, Mr. Jarvis Lorry withdrew to consider it.` },
    { type: 'h2', text: `Chapter V — The Wine-shop` },
    { type: 'p', text: `A large cask of wine had been dropped and broken, in the street. The accident had happened in getting it out of a cart; the cask had tumbled out with a run, the hoops had burst, and it lay on the stones just outside the door of the wine-shop, shattered like a walnut-shell.` },
    { type: 'p', text: `All the people within reach had suspended their business, or their idleness, to run to the spot and drink the wine. The rough, irregular stones of the street, pointing every way, and designed, one might have thought, expressly to lame all living creatures that approached them, had dammed it into little pools; these were surrounded, each by its own jostling group or crowd, according to its size. Some men kneeled down, made scoops of their two hands joined, and sipped, or tried to help women, who bent over their shoulders, to sip, before the wine had all run out between their fingers. Others, men and women, dipped in the puddles with little mugs of mutilated earthenware, or even with handkerchiefs from women’s heads, which were squeezed dry into infants’ mouths; others made small mud-embankments, to stem the wine as it ran; others, directed by lookers-on up at high windows, darted here and there, to cut off little streams of wine that started away in new directions; others devoted themselves to the sodden and lee-dyed pieces of the cask, licking, and even champing the moister wine-rotted fragments with eager relish. There was no drainage to carry off the wine, and not only did it all get taken up, but so much mud got taken up along with it, that there might have been a scavenger in the street, if anybody acquainted with it could have believed in such a miraculous presence.` },
    { type: 'p', text: `A shrill sound of laughter and of amused voices—voices of men, women, and children—resounded in the street while this wine game lasted. There was little roughness in the sport, and much playfulness. There was a special companionship in it, an observable inclination on the part of every one to join some other one, which led, especially among the luckier or lighter-hearted, to frolicsome embraces, drinking of healths, shaking of hands, and even joining of hands and dancing, a dozen together. When the wine was gone, and the places where it had been most abundant were raked into a gridiron-pattern by fingers, these demonstrations ceased, as suddenly as they had broken out. The man who had left his saw sticking in the firewood he was cutting, set it in motion again; the women who had left on a door-step the little pot of hot ashes, at which she had been trying to soften the pain in her own starved fingers and toes, or in those of her child, returned to it; men with bare arms, matted locks, and cadaverous faces, who had emerged into the winter light from cellars, moved away, to descend again; and a gloom gathered on the scene that appeared more natural to it than sunshine.` },
    { type: 'p', text: `The wine was red wine, and had stained the ground of the narrow street in the suburb of Saint Antoine, in Paris, where it was spilled. It had stained many hands, too, and many faces, and many naked feet, and many wooden shoes. The hands of the man who sawed the wood, left red marks on the billets; and the forehead of the woman who nursed her baby, was stained with the stain of the old rag she wound about her head again. Those who had been greedy with the staves of the cask, had acquired a tigerish smear about the mouth; and one tall joker so besmirched, his head more out of a long squalid bag of a nightcap than in it, scrawled upon a wall with his finger dipped in muddy wine-lees—*blood*.` },
    { type: 'p', text: `The time was to come, when that wine too would be spilled on the street-stones, and when the stain of it would be red upon many there.` },
    { type: 'p', text: `And now that the cloud settled on Saint Antoine, which a momentary gleam had driven from his sacred countenance, the darkness of it was heavy—cold, dirt, sickness, ignorance, and want, were the lords in waiting on the saintly presence—nobles of great power all of them; but, most especially the last. Samples of a people that had undergone a terrible grinding and regrinding in the mill, and certainly not in the fabulous mill which ground old people young, shivered at every corner, passed in and out at every doorway, looked from every window, fluttered in every vestige of a garment that the wind shook. The mill which had worked them down, was the mill that grinds young people old; the children had ancient faces and grave voices; and upon them, and upon the grown faces, and ploughed into every furrow of age and coming up afresh, was the sigh, Hunger. It was prevalent everywhere. Hunger was pushed out of the tall houses, in the wretched clothing that hung upon poles and lines; Hunger was patched into them with straw and rag and wood and paper; Hunger was repeated in every fragment of the small modicum of firewood that the man sawed off; Hunger stared down from the smokeless chimneys, and started up from the filthy street that had no offal, among its refuse, of anything to eat. Hunger was the inscription on the baker’s shelves, written in every small loaf of his scanty stock of bad bread; at the sausage-shop, in every dead-dog preparation that was offered for sale. Hunger rattled its dry bones among the roasting chestnuts in the turned cylinder; Hunger was shred into atomics in every farthing porringer of husky chips of potato, fried with some reluctant drops of oil.` },
    { type: 'p', text: `Its abiding place was in all things fitted to it. A narrow winding street, full of offence and stench, with other narrow winding streets diverging, all peopled by rags and nightcaps, and all smelling of rags and nightcaps, and all visible things with a brooding look upon them that looked ill. In the hunted air of the people there was yet some wild-beast thought of the possibility of turning at bay. Depressed and slinking though they were, eyes of fire were not wanting among them; nor compressed lips, white with what they suppressed; nor foreheads knitted into the likeness of the gallows-rope they mused about enduring, or inflicting. The trade signs (and they were almost as many as the shops) were, all, grim illustrations of Want. The butcher and the porkman painted up, only the leanest scrags of meat; the baker, the coarsest of meagre loaves. The people rudely pictured as drinking in the wine-shops, croaked over their scanty measures of thin wine and beer, and were gloweringly confidential together. Nothing was represented in a flourishing condition, save tools and weapons; but, the cutler’s knives and axes were sharp and bright, the smith’s hammers were heavy, and the gunmaker’s stock was murderous. The crippling stones of the pavement, with their many little reservoirs of mud and water, had no footways, but broke off abruptly at the doors. The kennel, to make amends, ran down the middle of the street—when it ran at all: which was only after heavy rains, and then it ran, by many eccentric fits, into the houses. Across the streets, at wide intervals, one clumsy lamp was slung by a rope and pulley; at night, when the lamplighter had let these down, and lighted, and hoisted them again, a feeble grove of dim wicks swung in a sickly manner overhead, as if they were at sea. Indeed they were at sea, and the ship and crew were in peril of tempest.` },
    { type: 'p', text: `For, the time was to come, when the gaunt scarecrows of that region should have watched the lamplighter, in their idleness and hunger, so long, as to conceive the idea of improving on his method, and hauling up men by those ropes and pulleys, to flare upon the darkness of their condition. But, the time was not come yet; and every wind that blew over France shook the rags of the scarecrows in vain, for the birds, fine of song and feather, took no warning.` },
    { type: 'p', text: `The wine-shop was a corner shop, better than most others in its appearance and degree, and the master of the wine-shop had stood outside it, in a yellow waistcoat and green breeches, looking on at the struggle for the lost wine. “It’s not my affair,” said he, with a final shrug of the shoulders. “The people from the market did it. Let them bring another.”` },
    { type: 'p', text: `There, his eyes happening to catch the tall joker writing up his joke, he called to him across the way:` },
    { type: 'p', text: `“Say, then, my Gaspard, what do you do there?”` },
    { type: 'p', text: `The fellow pointed to his joke with immense significance, as is often the way with his tribe. It missed its mark, and completely failed, as is often the way with his tribe too.` },
    { type: 'p', text: `“What now? Are you a subject for the mad hospital?” said the wine-shop keeper, crossing the road, and obliterating the jest with a handful of mud, picked up for the purpose, and smeared over it. “Why do you write in the public streets? Is there—tell me thou—is there no other place to write such words in?”` },
    { type: 'p', text: `In his expostulation he dropped his cleaner hand (perhaps accidentally, perhaps not) upon the joker’s heart. The joker rapped it with his own, took a nimble spring upward, and came down in a fantastic dancing attitude, with one of his stained shoes jerked off his foot into his hand, and held out. A joker of an extremely, not to say wolfishly practical character, he looked, under those circumstances.` },
    { type: 'p', text: `“Put it on, put it on,” said the other. “Call wine, wine; and finish there.” With that advice, he wiped his soiled hand upon the joker’s dress, such as it was—quite deliberately, as having dirtied the hand on his account; and then recrossed the road and entered the wine-shop.` },
    { type: 'p', text: `This wine-shop keeper was a bull-necked, martial-looking man of thirty, and he should have been of a hot temperament, for, although it was a bitter day, he wore no coat, but carried one slung over his shoulder. His shirt-sleeves were rolled up, too, and his brown arms were bare to the elbows. Neither did he wear anything more on his head than his own crisply-curling short dark hair. He was a dark man altogether, with good eyes and a good bold breadth between them. Good-humoured looking on the whole, but implacable-looking, too; evidently a man of a strong resolution and a set purpose; a man not desirable to be met, rushing down a narrow pass with a gulf on either side, for nothing would turn the man.` },
    { type: 'p', text: `Madame Defarge, his wife, sat in the shop behind the counter as he came in. Madame Defarge was a stout woman of about his own age, with a watchful eye that seldom seemed to look at anything, a large hand heavily ringed, a steady face, strong features, and great composure of manner. There was a character about Madame Defarge, from which one might have predicated that she did not often make mistakes against herself in any of the reckonings over which she presided. Madame Defarge being sensitive to cold, was wrapped in fur, and had a quantity of bright shawl twined about her head, though not to the concealment of her large earrings. Her knitting was before her, but she had laid it down to pick her teeth with a toothpick. Thus engaged, with her right elbow supported by her left hand, Madame Defarge said nothing when her lord came in, but coughed just one grain of cough. This, in combination with the lifting of her darkly defined eyebrows over her toothpick by the breadth of a line, suggested to her husband that he would do well to look round the shop among the customers, for any new customer who had dropped in while he stepped over the way.` },
    { type: 'p', text: `The wine-shop keeper accordingly rolled his eyes about, until they rested upon an elderly gentleman and a young lady, who were seated in a corner. Other company were there: two playing cards, two playing dominoes, three standing by the counter lengthening out a short supply of wine. As he passed behind the counter, he took notice that the elderly gentleman said in a look to the young lady, “This is our man.”` },
    { type: 'p', text: `“What the devil do *you* do in that galley there?” said Monsieur Defarge to himself; “I don’t know you.”` },
    { type: 'p', text: `But, he feigned not to notice the two strangers, and fell into discourse with the triumvirate of customers who were drinking at the counter.` },
    { type: 'p', text: `“How goes it, Jacques?” said one of these three to Monsieur Defarge. “Is all the spilt wine swallowed?”` },
    { type: 'p', text: `“Every drop, Jacques,” answered Monsieur Defarge.` },
    { type: 'p', text: `When this interchange of Christian name was effected, Madame Defarge, picking her teeth with her toothpick, coughed another grain of cough, and raised her eyebrows by the breadth of another line.` },
    { type: 'p', text: `“It is not often,” said the second of the three, addressing Monsieur Defarge, “that many of these miserable beasts know the taste of wine, or of anything but black bread and death. Is it not so, Jacques?”` },
    { type: 'p', text: `“It is so, Jacques,” Monsieur Defarge returned.` },
    { type: 'p', text: `At this second interchange of the Christian name, Madame Defarge, still using her toothpick with profound composure, coughed another grain of cough, and raised her eyebrows by the breadth of another line.` },
    { type: 'p', text: `The last of the three now said his say, as he put down his empty drinking vessel and smacked his lips.` },
    { type: 'p', text: `“Ah! So much the worse! A bitter taste it is that such poor cattle always have in their mouths, and hard lives they live, Jacques. Am I right, Jacques?”` },
    { type: 'p', text: `“You are right, Jacques,” was the response of Monsieur Defarge.` },
    { type: 'p', text: `This third interchange of the Christian name was completed at the moment when Madame Defarge put her toothpick by, kept her eyebrows up, and slightly rustled in her seat.` },
    { type: 'p', text: `“Hold then! True!” muttered her husband. “Gentlemen—my wife!”` },
    { type: 'p', text: `The three customers pulled off their hats to Madame Defarge, with three flourishes. She acknowledged their homage by bending her head, and giving them a quick look. Then she glanced in a casual manner round the wine-shop, took up her knitting with great apparent calmness and repose of spirit, and became absorbed in it.` },
    { type: 'p', text: `“Gentlemen,” said her husband, who had kept his bright eye observantly upon her, “good day. The chamber, furnished bachelor-fashion, that you wished to see, and were inquiring for when I stepped out, is on the fifth floor. The doorway of the staircase gives on the little courtyard close to the left here,” pointing with his hand, “near to the window of my establishment. But, now that I remember, one of you has already been there, and can show the way. Gentlemen, adieu!”` },
    { type: 'p', text: `They paid for their wine, and left the place. The eyes of Monsieur Defarge were studying his wife at her knitting when the elderly gentleman advanced from his corner, and begged the favour of a word.` },
    { type: 'p', text: `“Willingly, sir,” said Monsieur Defarge, and quietly stepped with him to the door.` },
    { type: 'p', text: `Their conference was very short, but very decided. Almost at the first word, Monsieur Defarge started and became deeply attentive. It had not lasted a minute, when he nodded and went out. The gentleman then beckoned to the young lady, and they, too, went out. Madame Defarge knitted with nimble fingers and steady eyebrows, and saw nothing.` },
    { type: 'p', text: `Mr. Jarvis Lorry and Miss Manette, emerging from the wine-shop thus, joined Monsieur Defarge in the doorway to which he had directed his own company just before. It opened from a stinking little black courtyard, and was the general public entrance to a great pile of houses, inhabited by a great number of people. In the gloomy tile-paved entry to the gloomy tile-paved staircase, Monsieur Defarge bent down on one knee to the child of his old master, and put her hand to his lips. It was a gentle action, but not at all gently done; a very remarkable transformation had come over him in a few seconds. He had no good-humour in his face, nor any openness of aspect left, but had become a secret, angry, dangerous man.` },
    { type: 'p', text: `“It is very high; it is a little difficult. Better to begin slowly.” Thus, Monsieur Defarge, in a stern voice, to Mr. Lorry, as they began ascending the stairs.` },
    { type: 'p', text: `“Is he alone?” the latter whispered.` },
    { type: 'p', text: `“Alone! God help him, who should be with him!” said the other, in the same low voice.` },
    { type: 'p', text: `“Is he always alone, then?”` },
    { type: 'p', text: `“Yes.”` },
    { type: 'p', text: `“Of his own desire?”` },
    { type: 'p', text: `“Of his own necessity. As he was, when I first saw him after they found me and demanded to know if I would take him, and, at my peril be discreet—as he was then, so he is now.”` },
    { type: 'p', text: `“He is greatly changed?”` },
    { type: 'p', text: `“Changed!”` },
    { type: 'p', text: `The keeper of the wine-shop stopped to strike the wall with his hand, and mutter a tremendous curse. No direct answer could have been half so forcible. Mr. Lorry’s spirits grew heavier and heavier, as he and his two companions ascended higher and higher.` },
    { type: 'p', text: `Such a staircase, with its accessories, in the older and more crowded parts of Paris, would be bad enough now; but, at that time, it was vile indeed to unaccustomed and unhardened senses. Every little habitation within the great foul nest of one high building—that is to say, the room or rooms within every door that opened on the general staircase—left its own heap of refuse on its own landing, besides flinging other refuse from its own windows. The uncontrollable and hopeless mass of decomposition so engendered, would have polluted the air, even if poverty and deprivation had not loaded it with their intangible impurities; the two bad sources combined made it almost insupportable. Through such an atmosphere, by a steep dark shaft of dirt and poison, the way lay. Yielding to his own disturbance of mind, and to his young companion’s agitation, which became greater every instant, Mr. Jarvis Lorry twice stopped to rest. Each of these stoppages was made at a doleful grating, by which any languishing good airs that were left uncorrupted, seemed to escape, and all spoilt and sickly vapours seemed to crawl in. Through the rusted bars, tastes, rather than glimpses, were caught of the jumbled neighbourhood; and nothing within range, nearer or lower than the summits of the two great towers of Notre-Dame, had any promise on it of healthy life or wholesome aspirations.` },
    { type: 'p', text: `At last, the top of the staircase was gained, and they stopped for the third time. There was yet an upper staircase, of a steeper inclination and of contracted dimensions, to be ascended, before the garret story was reached. The keeper of the wine-shop, always going a little in advance, and always going on the side which Mr. Lorry took, as though he dreaded to be asked any question by the young lady, turned himself about here, and, carefully feeling in the pockets of the coat he carried over his shoulder, took out a key.` },
    { type: 'p', text: `“The door is locked then, my friend?” said Mr. Lorry, surprised.` },
    { type: 'p', text: `“Ay. Yes,” was the grim reply of Monsieur Defarge.` },
    { type: 'p', text: `“You think it necessary to keep the unfortunate gentleman so retired?”` },
    { type: 'p', text: `“I think it necessary to turn the key.” Monsieur Defarge whispered it closer in his ear, and frowned heavily.` },
    { type: 'p', text: `“Why?”` },
    { type: 'p', text: `“Why! Because he has lived so long, locked up, that he would be frightened—rave—tear himself to pieces—die—come to I know not what harm—if his door was left open.”` },
    { type: 'p', text: `“Is it possible!” exclaimed Mr. Lorry.` },
    { type: 'p', text: `“Is it possible!” repeated Defarge, bitterly. “Yes. And a beautiful world we live in, when it *is* possible, and when many other such things are possible, and not only possible, but done—done, see you!—under that sky there, every day. Long live the Devil. Let us go on.”` },
    { type: 'p', text: `This dialogue had been held in so very low a whisper, that not a word of it had reached the young lady’s ears. But, by this time she trembled under such strong emotion, and her face expressed such deep anxiety, and, above all, such dread and terror, that Mr. Lorry felt it incumbent on him to speak a word or two of reassurance.` },
    { type: 'p', text: `“Courage, dear miss! Courage! Business! The worst will be over in a moment; it is but passing the room-door, and the worst is over. Then, all the good you bring to him, all the relief, all the happiness you bring to him, begin. Let our good friend here, assist you on that side. That’s well, friend Defarge. Come, now. Business, business!”` },
    { type: 'p', text: `They went up slowly and softly. The staircase was short, and they were soon at the top. There, as it had an abrupt turn in it, they came all at once in sight of three men, whose heads were bent down close together at the side of a door, and who were intently looking into the room to which the door belonged, through some chinks or holes in the wall. On hearing footsteps close at hand, these three turned, and rose, and showed themselves to be the three of one name who had been drinking in the wine-shop.` },
    { type: 'p', text: `“I forgot them in the surprise of your visit,” explained Monsieur Defarge. “Leave us, good boys; we have business here.”` },
    { type: 'p', text: `The three glided by, and went silently down.` },
    { type: 'p', text: `There appearing to be no other door on that floor, and the keeper of the wine-shop going straight to this one when they were left alone, Mr. Lorry asked him in a whisper, with a little anger:` },
    { type: 'p', text: `“Do you make a show of Monsieur Manette?”` },
    { type: 'p', text: `“I show him, in the way you have seen, to a chosen few.”` },
    { type: 'p', text: `“Is that well?”` },
    { type: 'p', text: `“*I* think it is well.”` },
    { type: 'p', text: `“Who are the few? How do you choose them?”` },
    { type: 'p', text: `“I choose them as real men, of my name—Jacques is my name—to whom the sight is likely to do good. Enough; you are English; that is another thing. Stay there, if you please, a little moment.”` },
    { type: 'p', text: `With an admonitory gesture to keep them back, he stooped, and looked in through the crevice in the wall. Soon raising his head again, he struck twice or thrice upon the door—evidently with no other object than to make a noise there. With the same intention, he drew the key across it, three or four times, before he put it clumsily into the lock, and turned it as heavily as he could.` },
    { type: 'p', text: `The door slowly opened inward under his hand, and he looked into the room and said something. A faint voice answered something. Little more than a single syllable could have been spoken on either side.` },
    { type: 'p', text: `He looked back over his shoulder, and beckoned them to enter. Mr. Lorry got his arm securely round the daughter’s waist, and held her; for he felt that she was sinking.` },
    { type: 'p', text: `“A-a-a-business, business!” he urged, with a moisture that was not of business shining on his cheek. “Come in, come in!”` },
    { type: 'p', text: `“I am afraid of it,” she answered, shuddering.` },
    { type: 'p', text: `“Of it? What?”` },
    { type: 'p', text: `“I mean of him. Of my father.”` },
    { type: 'p', text: `Rendered in a manner desperate, by her state and by the beckoning of their conductor, he drew over his neck the arm that shook upon his shoulder, lifted her a little, and hurried her into the room. He sat her down just within the door, and held her, clinging to him.` },
    { type: 'p', text: `Defarge drew out the key, closed the door, locked it on the inside, took out the key again, and held it in his hand. All this he did, methodically, and with as loud and harsh an accompaniment of noise as he could make. Finally, he walked across the room with a measured tread to where the window was. He stopped there, and faced round.` },
    { type: 'p', text: `The garret, built to be a depository for firewood and the like, was dim and dark: for, the window of dormer shape, was in truth a door in the roof, with a little crane over it for the hoisting up of stores from the street: unglazed, and closing up the middle in two pieces, like any other door of French construction. To exclude the cold, one half of this door was fast closed, and the other was opened but a very little way. Such a scanty portion of light was admitted through these means, that it was difficult, on first coming in, to see anything; and long habit alone could have slowly formed in any one, the ability to do any work requiring nicety in such obscurity. Yet, work of that kind was being done in the garret; for, with his back towards the door, and his face towards the window where the keeper of the wine-shop stood looking at him, a white-haired man sat on a low bench, stooping forward and very busy, making shoes.` },
  ],
  'Kern King': [
    { type: 'h1', text: `Kern King` },
    { type: 'h2', text: `Part 1 — Lowercase` },
    { type: 'p', text: `lynx tuft frogs, dolphins abduct by proxy the ever awkward klutz, dud, dummkopf, jinx snubnose filmgoer, orphan sgt. renfruw grudgek reyfus, md. sikh psych if halt tympany jewelry sri heh! twyer vs jojo pneu fylfot alcaaba son of nonplussed halfbreed bubbly playboy guggenheim daddy coccyx sgraffito effect, vacuum dirndle impossible attempt to disvalue, muzzle the afghan czech czar and exninja, bob bixby dvorak wood dhurrie savvy, dizzy eye aeon circumcision uvula scrungy picnic luxurious special type carbohydrate ovoid adzuki kumquat bomb? afterglows gold girl pygmy gnome lb. ankhs acme aggroupment akmed brouhha tv wt. ujjain ms. oz abacus mnemonics bhikku khaki bwana aorta embolism vivid owls often kvetch otherwise, wysiwyg densfort wright you've absorbed rhythm, put obstacle kyaks krieg kern wurst subject enmity equity coquet quorum pique tzetse hepzibah sulfhydryl briefcase ajax ehler kafka fjord elfship halfdressed jugful eggcup hummingbirds swingdevil bagpipe legwork reproachful hunchback archknave baghdad wejh rijswijk rajbansi rajput ajdir okay weekday obfuscate subpoena liebknecht marcgravia ecbolic arcticward dickcissel pincpinc boldface maidkin adjective adcraft adman dwarfness applejack darkbrown kiln palzy always farmland flimflam unbossy nonlineal stepbrother lapdog stopgap.` },
    { type: 'h2', text: `Part 2 — Uppercase` },
    { type: 'p', text: `LYNX TUFT FROGS, DOLPHINS ABDUCT BY PROXY THE EVER AWKWARD KLUTZ, DUD, DUMMKOPF, JINX SNUBNOSE FILMGOER, ORPHAN SGT. RENFRUW GRUDGEK REYFUS, MD. SIKH PSYCH IF HALT TYMPANY JEWELRY SRI HEH! TWYER VS JOJO PNEU FYLFOT ALCAABA SON OF NONPLUSSED HALFBREED BUBBLY PLAYBOY GUGGENHEIM DADDY COCCYX SGRAFFITO EFFECT, VACUUM DIRNDLE IMPOSSIBLE ATTEMPT TO DISVALUE, MUZZLE THE AFGHAN CZECH CZAR AND EXNINJA, BOB BIXBY DVORAK WOOD DHURRIE SAVVY, DIZZY EYE AEON CIRCUMCISION UVULA SCRUNGY PICNIC LUXURIOUS SPECIAL TYPE CARBOHYDRATE OVOID ADZUKI KUMQUAT BOMB? AFTERGLOWS GOLD GIRL PYGMY GNOME LB. ANKHS ACME AGGROUPMENT AKMED BROUHHA TV WT. UJJAIN MS. OZ ABACUS MNEMONICS BHIKKU KHAKI BWANA AORTA EMBOLISM VIVID OWLS OFTEN KVETCH OTHERWISE.` },
    { type: 'h2', text: `Part 4 — Numbers` },
    { type: 'p', text: `0010203040500607080900 10112131415116171819100 20212232425226272829200 30313233435336373839300 40414243445446474849400 (1)(2)(3)(4)(5)(6)(7)(8)(9)(0) $00 $10 $20 $30 £40 £50 £60 £70 00¢ 11¢ 22¢ 33¢ 44¢ 00% 0‰ 0-0.0,0…0° 11% 1‰ 1-1.1,1…1° 12% 2‰ 2-2.2,2…2°` },
  ],
}

// Display tiers (font-proofer TAILWIND_XL), largest → smallest.
export const DISPLAY_TIERS = [
  { key: 'text-9xl', px: 128 }, { key: 'text-8xl', px: 96 }, { key: 'text-7xl', px: 72 },
  { key: 'text-6xl', px: 60 }, { key: 'text-5xl', px: 48 }, { key: 'text-4xl', px: 36 },
  { key: 'text-3xl', px: 30 }, { key: 'text-2xl', px: 24 }, { key: 'text-xl', px: 20 },
]
// Body tiers paired under each display head.
export const BODY_TIERS = [
  { key: 'text-lg', px: 18 }, { key: 'text-base', px: 16 }, { key: 'text-sm', px: 14 }, { key: 'text-xs', px: 12 },
]
// Every tier (largest → smallest) for the Scale style menu. Sizes are Tailwind-fixed;
// only tracking/leading (+ axes later) are per-tier editable.
export const SCALE_TIERS = [...DISPLAY_TIERS, ...BODY_TIERS]
export type ScaleTierStyle = { tracking: number; leading: number }
export type ScaleStyles = Record<string, ScaleTierStyle>
export const DEFAULT_SCALE_STYLES: ScaleStyles = Object.fromEntries(
  SCALE_TIERS.map(t => [t.key, { tracking: 0, leading: t.px >= 44 ? 1.05 : 1.4 }]),
)
const HEAD_WORD = 'Cal Sans'
const PAIR_BODY = 'A wonderful serenity has taken possession of my entire soul, like these sweet mornings of spring which I enjoy with my whole heart. I am alone, and feel the charm of existence in this spot, which was created for the bliss of souls like mine.'

// Curated OpenType feature chips from Cal Sans's real GSUB tags. The ss family is
// the manual override for the same variants GEOM drives automatically.
export const FEATURE_CHIPS: { tag: string; label: string }[] = [
  { tag: 'liga', label: 'Ligatures' },
  { tag: 'dlig', label: 'Discretionary ligatures' },
  { tag: 'case', label: 'Case-sensitive' },
  { tag: 'tnum', label: 'Tabular figures' },
  { tag: 'pnum', label: 'Proportional figures' },
  { tag: 'zero', label: 'Slashed zero' },
  { tag: 'frac', label: 'Fractions' },
  { tag: 'ordn', label: 'Ordinals' },
]

// Real stylistic-set names from CalSansVF's GSUB FeatureParams. Shown as compact
// ssNN tokens; the full name lives in title + aria-label. The ss family is the
// manual override for the same variants GEOM drives automatically.
export const SS_FEATURES: { tag: string; name: string }[] = [
  { tag: 'ss01', name: 'Geometric a' },
  { tag: 'ss02', name: 'Humanist a' },
  { tag: 'ss03', name: 'Tailed a' },
  { tag: 'ss04', name: 'Geometric g' },
  { tag: 'ss05', name: 'Gothic g' },
  { tag: 'ss06', name: 'Geometric G' },
  { tag: 'ss07', name: 'Humanist G' },
  { tag: 'ss08', name: 'Constructed j and y' },
  { tag: 'ss09', name: 'Humanist j and y' },
  { tag: 'ss10', name: 'Futura alternatives' },
  { tag: 'ss11', name: 'Futura alternatives and ligations' },
  { tag: 'ss12', name: 'Angular M' },
  { tag: 'ss13', name: 'Square M' },
  { tag: 'ss14', name: 'Constructed f and t' },
  { tag: 'ss15', name: 'Humanist f and t' },
  { tag: 'ss16', name: 'Humanist/Grotesk 6 and 9' },
  { tag: 'ss17', name: 'Geometric/legible 6 and 9' },
  { tag: 'ss18', name: 'A11Y I l a' },
  { tag: 'ss19', name: 'Constructed l' },
  { tag: 'ss20', name: 'Horizontal Sharps' },
]

// ── Scenes ──────────────────────────────────────────────────────────────────────
// SEO landing pages boot Paragraph with a referent-aware pitch as its own source tab.
if (BOOT.pitch) {
  TEXT_PRESETS.Compare = [
    { type: 'h1', text: BOOT.pitch.title },
    ...BOOT.pitch.paragraphs.map((t): Block => ({ type: 'p', text: t })),
  ]
}
export const TEXT_SOURCES = Object.keys(TEXT_PRESETS)

export type SceneProps = {
  size: number; ls: string; leading: number; featStr: string
  source: string; measure: number; pairs: Set<string>; glyphSet: string; opszAuto: boolean
  paraStyles: ParaStyles
  scaleStyles: ScaleStyles; selectedTiers: Set<string>
}

// When opsz-auto is on, omit opsz from the settings and set font-optical-sizing:auto
// so the browser tracks opsz to each element's rendered size (per font-proofer).
const optical = (auto: boolean): 'auto' | 'none' => (auto ? 'auto' : 'none')

// Which variant a glyph shows at a given GEOM = how many of its swap thresholds
// GEOM has passed (matches the non-HOI font's rclt band edges in GROUP_DEFS).
const variantIndex = (geom: number, thresholds: number[]): number =>
  thresholds.reduce((n, t) => n + (geom >= t ? 1 : 0), 0)

const SWAP_GLYPHS = new Set(GROUP_DEFS.map(d => d.glyph))

// Resolve a character to its swap GROUP key (the GROUP_DEFS representative), so
// diacritic composites flash with their base group: à→a, ç→c, Ç→C, ª→a. Composites
// share their base's `rclt` condition, so they inherit its thresholds/zone/colour.
// NFKD handles diacritics + compatibility forms (ª→a); EXTRA_MEMBERS covers
// non-decomposing look-alikes. Returns undefined for non-swap glyphs.
// Font-derived swap zone → colour (matches the GROUP_DEFS zone palette). '-'/'U' → none.
const ZONE_COLOR: Record<string, string> = { A: '#c97050', B: '#4a7fd4', G: '#4aad5c' }
// Codepoint behind a grid cell's char (skip the ◌ U+25CC carrier on combining marks).
const cpOf = (ch: string): number => (ch.charCodeAt(0) === 0x25CC ? ch.codePointAt(1)! : ch.codePointAt(0)!)
// Grid flash entries: every rclt-swap cell (base + aalt compounds) with its thresholds
// and per-band colour, precomputed from the font-derived GRID_SWAPS.
const GRID_ENTRIES = Object.entries(GRID_SWAPS).map(([key, s]) => ({
  key, t: s.t, colors: [...s.z].map(z => ZONE_COLOR[z] ?? null),
}))

const EXTRA_MEMBERS: Record<string, string> = { 'ɑ': 'a' }
const groupKeyOf = (ch: string): string | undefined => {
  if (SWAP_GLYPHS.has(ch)) return ch
  const base = ch.normalize('NFKD')[0]
  if (base && SWAP_GLYPHS.has(base)) return base
  return EXTRA_MEMBERS[ch]
}

type Flashes = Record<string, { color: string; nonce: number }>

// ── Freezer gold ─────────────────────────────────────────────────────────────────
// Characters a frozen feature swaps get painted gold in the specimen — the freezer's
// zone-like colour language ("held off GEOM", distinct from the four GEOM zone hues).
// ss/cv derive their chars from `families`; figure/case features from an explicit list.
const FEATURE_CHARS: Record<string, string> = {
  tnum: '0123456789', pnum: '0123456789', zero: '0', case: '-–—()[]{}',
}
const FEATURE_FAMILIES: Record<string, string[]> =
  Object.fromEntries([...SUBS.stylisticSets, ...SUBS.charVariants].map(f => [f.tag, f.families]))
function frozenCharSet(tags: string[]): Set<string> {
  const s = new Set<string>()
  for (const t of tags) {
    for (const c of FEATURE_FAMILIES[t] ?? []) s.add(c)
    for (const c of FEATURE_CHARS[t] ?? '') s.add(c)
  }
  return s
}

// Shared GEOM-crossing detector (EDIT mode only). As GEOM crosses a swapping
// glyph's threshold, that glyph is flagged with the zone colour of the variant it
// just entered — a persistent per-glyph colour, not a one-shot pulse. Landing on
// the neutral `default` master hard-clears the glyph (no colour). Only the active
// scene mounts, so exactly one detector runs.
//
// v2 behaviour, gated on `dragging` (= rail GEOM slider held, store.geomDragging):
//   dragging  → glyphs HOLD their colour; crossings hard-switch / hard-off in place.
//   released  → each held glyph runs the glyph-flash keyframe back to rest, then
//               `clear`s (so text glyphs un-wrap and ligatures restore).
// A chip-click / keyboard nudge changes GEOM while not dragging, so it reads as a
// one-shot flash (hard-on → fade), matching the old behaviour.
function useGeomFlash(): { flashes: Flashes; clear: (ch: string) => void; dragging: boolean } {
  const { state } = useInstrument()
  const geom = effectiveAxes(state).GEOM
  // Live thresholds — so the flash fires at the user's CURRENT swap positions
  // (matrix/preset edits), not the static GROUP_DEFS seed.
  const thresholds = effectiveThresholds(state)
  const editing = state.recalMode === 'edit'
  const dragging = state.geomDragging
  const [flashes, setFlashes] = useState<Flashes>({})
  const prevGeom = useRef(geom)
  const prevEditing = useRef(editing)
  const nonce = useRef(0)
  useEffect(() => {
    const from = prevGeom.current, wasEditing = prevEditing.current
    prevGeom.current = geom
    prevEditing.current = editing
    if (!editing || !wasEditing || from === geom) return   // real GEOM moves only, while editing
    setFlashes(prev => {
      const next = { ...prev }
      let changed = false
      for (const def of GROUP_DEFS) {
        const thr = thresholds[def.glyph] ?? def.defaultThresholds
        const after = variantIndex(geom, thr)
        if (after === variantIndex(from, thr)) continue   // this glyph didn't cross
        const variant = def.variants[after]
        if (variant.label === 'default') {                  // swapped back to the neutral master → hard-off
          if (def.glyph in next) { delete next[def.glyph]; changed = true }
        } else {                                            // hard-on / hard-switch to a zone colour
          next[def.glyph] = { color: variant.color, nonce: ++nonce.current }
          changed = true
        }
      }
      return changed ? next : prev
    })
  }, [geom, editing])
  // Release cleanup: on drag-release the held spans swap in place from
  // `geom-flash-hold` to `geom-flash`, and that in-place swap's animationend does
  // NOT reach React's per-span onAnimationEnd — so un-wrap them here once the fade
  // (.5s keyframe) has played. Re-grabbing before then cancels the sweep.
  const wasDragging = useRef(dragging)
  useEffect(() => {
    const was = wasDragging.current
    wasDragging.current = dragging
    if (was && !dragging) {
      const t = setTimeout(() => setFlashes({}), 520)
      return () => clearTimeout(t)
    }
  }, [dragging])
  const clear = (ch: string) => setFlashes(f => (ch in f ? (({ [ch]: _, ...rest }) => rest)(f) : f))
  return { flashes, clear, dragging }
}

// Freezer gold trigger (A + B). The frozen glyphs light gold transiently — never
// persistently — so the specimen is clean at rest:
//   A) toggling a freeze pulses just the changed feature's glyphs, then fades;
//   B) dragging GEOM holds all frozen glyphs gold, fading a beat after release.
// Reuses the geom-flash hold/fade timing; the hold-vs-fade class is picked in flashText
// off the same `dragging` flag.
const symDiff = (a: string[], b: string[]): string[] =>
  [...a.filter(x => !b.includes(x)), ...b.filter(x => !a.includes(x))]

function useFrozenGold(tags: string[]): { chars: Set<string> } | null {
  const { state } = useInstrument()
  const dragging = state.geomDragging
  const [pulse, setPulse] = useState<Set<string> | null>(null)   // A: toggle-triggered fade set
  const [dragFade, setDragFade] = useState(false)                // B: post-release fade window
  const prevTags = useRef(tags)
  const wasDragging = useRef(dragging)
  useEffect(() => {   // A — a freeze was toggled: pulse the changed feature's glyphs
    const prev = prevTags.current; prevTags.current = tags
    if (prev === tags) return
    const changed = symDiff(prev, tags)
    if (!changed.length) return
    setPulse(frozenCharSet(changed))
    const t = setTimeout(() => setPulse(null), 560)
    return () => clearTimeout(t)
  }, [tags])
  useEffect(() => {   // B — GEOM drag released: run the fade beat
    const was = wasDragging.current; wasDragging.current = dragging
    if (dragging) { setDragFade(false); return }
    if (was) { setDragFade(true); const t = setTimeout(() => setDragFade(false), 560); return () => clearTimeout(t) }
  }, [dragging])
  if (dragging || dragFade) return { chars: frozenCharSet(tags) }   // B wins → all frozen glyphs
  if (pulse) return { chars: pulse }                                // A → just the toggled one
  return null
}

// Glyphs-grid flash: same hold-while-dragging / fade-on-release model as useGeomFlash,
// but detects crossings over the FULL font-derived swap set (GRID_ENTRIES, keyed by
// "cp:aaltIndex") — so base glyphs AND every rclt alternate/compound flash, not just
// the 16 GROUP_DEFS groups. Static font thresholds (grid is a specimen of the font).
function useGridFlash(): { flashes: Flashes; clear: (k: string) => void; dragging: boolean } {
  const { state } = useInstrument()
  const geom = effectiveAxes(state).GEOM
  const editing = state.recalMode === 'edit'
  const dragging = state.geomDragging
  const [flashes, setFlashes] = useState<Flashes>({})
  const prevGeom = useRef(geom)
  const prevEditing = useRef(editing)
  const nonce = useRef(0)
  useEffect(() => {
    const from = prevGeom.current, wasEditing = prevEditing.current
    prevGeom.current = geom
    prevEditing.current = editing
    if (!editing || !wasEditing || from === geom) return
    setFlashes(prev => {
      const next = { ...prev }
      let changed = false
      for (const e of GRID_ENTRIES) {
        const after = variantIndex(geom, e.t)
        if (after === variantIndex(from, e.t)) continue
        const color = e.colors[after]
        if (!color) { if (e.key in next) { delete next[e.key]; changed = true } }
        else { next[e.key] = { color, nonce: ++nonce.current }; changed = true }
      }
      return changed ? next : prev
    })
  }, [geom, editing])
  const wasDragging = useRef(dragging)
  useEffect(() => {
    const was = wasDragging.current
    wasDragging.current = dragging
    if (was && !dragging) {
      const t = setTimeout(() => setFlashes({}), 520)
      return () => clearTimeout(t)
    }
  }, [dragging])
  const clear = (k: string) => setFlashes(f => (k in f ? (({ [k]: _, ...rest }) => rest)(f) : f))
  return { flashes, clear, dragging }
}

// Render a string, wrapping a glyph in its own span ONLY while it's flashing — so
// normal text keeps its kerning/ligatures and only the flashing glyph splits out.
// While `dragging`, the span holds its colour (`geom-flash-hold`, no animation);
// on release it runs the keyframe fade (`geom-flash`) and `clear`s on animation end.
// Non-flashing runs stay plain (Fragment, no DOM).
function flashText(text: string, flashes: Flashes, clear: (ch: string) => void, dragging: boolean, kp = '', frozen?: Set<string>): ReactNode {
  const anyFrozen = !!frozen && frozen.size > 0
  const hasFlash = [...text].some(ch => { const gk = groupKeyOf(ch); return gk && flashes[gk] })
  const hasFrozen = anyFrozen && [...text].some(ch => frozen!.has(ch))
  if (!hasFlash && !hasFrozen) return text   // fast path: nothing to wrap
  const out: ReactNode[] = []
  let buf = '', runStart = 0
  const flush = () => { if (buf) { out.push(<Fragment key={`${kp}t${runStart}`}>{buf}</Fragment>); buf = '' } }
  ;[...text].forEach((ch, i) => {
    // A frozen glyph flashes gold (hold while dragging GEOM, else the fade beat) and
    // never GEOM-flashes its zone colour.
    if (anyFrozen && frozen!.has(ch)) {
      flush()
      out.push(<span key={`${kp}f${i}`} className={dragging ? 'freeze-gold-hold' : 'freeze-gold'}>{ch}</span>)
      return
    }
    const gk = groupKeyOf(ch)
    const fl = gk ? flashes[gk] : undefined
    if (fl) {
      flush()
      out.push(
        <span key={`${kp}g${i}-${fl.nonce}`} className={dragging ? 'geom-flash-hold' : 'geom-flash'}
          onAnimationEnd={dragging ? undefined : () => clear(gk!)}
          style={{ ['--flash-color' as string]: fl.color } as CSSProperties}>{ch}</span>,
      )
    } else { if (!buf) runStart = i; buf += ch }
  })
  flush()
  return out
}

// Flash context threaded into the markdown inline renderer so Paragraph/Scale glyphs
// flash too (same focused/unfocused model as Words).
type FlashCtx = { flashes: Flashes; clear: (ch: string) => void; dragging: boolean; frozen?: Set<string> }

// Markdown inline renderer that ALSO flash-wraps swap glyphs (composites included).
// Mirrors renderInline's delimiters; each text run and each bold/italic/underline
// inner run is flash-wrapped with a unique key prefix so sibling runs never collide.
function flashInline(text: string, boldVs: string, italVs: string, fc: FlashCtx, cmp?: CompareSpec | null): ReactNode {
  const F = (s: string, kp: string) => flashText(s, fc.flashes, fc.clear, fc.dragging, kp, fc.frozen)
  const toks = splitInlineMarkup(text)
  if (isPlainRun(toks)) return F(text, '')
  return toks.map((t, k) =>
    t.type === 'bold' ? <strong key={`b${k}`} style={cmp ? cmpBold(cmp) : { fontVariationSettings: boldVs, fontWeight: 'normal', fontSynthesis: 'none' }}>{F(t.value, `b${k}-`)}</strong>
      : t.type === 'italic' ? <em key={`i${k}`} style={cmp ? cmpItal(cmp) : { fontVariationSettings: italVs, fontStyle: 'normal', fontSynthesis: 'none' }}>{F(t.value, `i${k}-`)}</em>
        : t.type === 'underline' ? <u key={`u${k}`}>{F(t.value, `u${k}-`)}</u>
          : <Fragment key={`s${k}`}>{F(t.value, `s${k}-`)}</Fragment>)
}

// Compare-mode replacements for the markdown bold/italic spans: the referent font
// can't read wght/ital variation settings, so **bold** rides font-weight and *italic*
// snaps to the real italic style (or stays upright if the referent has none).
const cmpBold = (c: CompareSpec): CSSProperties => {
  const w = Math.min(700, c.wghtRange?.[1] ?? 700)
  const heavy = c.heavy && w >= c.heavy.from
  return {
    fontVariationSettings: 'normal', fontSynthesis: 'none',
    fontWeight: heavy ? c.heavy!.weight : w,
    ...(heavy ? { fontFamily: c.heavy!.family } : {}),
  }
}
const cmpItal = (c: CompareSpec): CSSProperties =>
  ({ fontVariationSettings: 'normal', fontStyle: c.italic ? 'italic' : 'normal', fontSynthesis: 'none' })

// ── Editable-markdown plumbing (ported/extended from font-proofer) ───────────────
// Caret utilities.
// caret helpers imported from wm-primitives (see import at top).

// Inline markdown → styled nodes: **bold** (wght axis), *italic* (ital axis),
// __underline__. Parsing shared (splitInlineMarkup); nesting is not handled.
function renderInline(text: string, boldVs: string, italVs: string, cmp?: CompareSpec | null): ReactNode {
  const toks = splitInlineMarkup(text)
  if (isPlainRun(toks)) return text
  return toks.map((t, k) =>
    t.type === 'bold' ? <strong key={k} style={cmp ? cmpBold(cmp) : { fontVariationSettings: boldVs, fontWeight: 'normal', fontSynthesis: 'none' }}>{t.value}</strong>
      : t.type === 'italic' ? <em key={k} style={cmp ? cmpItal(cmp) : { fontVariationSettings: italVs, fontStyle: 'normal', fontSynthesis: 'none' }}>{t.value}</em>
        : t.type === 'underline' ? <u key={k}>{t.value}</u>
          : t.value)
}

// A single contentEditable region: raw markdown while focused (browser owns the DOM,
// caret stable), styled preview when not. `onCommit` fires live (input) + on blur.
function EditableText({ value, onCommit, className, style, boldVs, italVs, flash, cmp }: {
  value: string; onCommit: (t: string) => void
  className?: string; style?: CSSProperties; boldVs: string; italVs: string; flash?: FlashCtx
  cmp?: CompareSpec | null
}) {
  const [focused, setFocused] = useState(false)
  const elRef = useRef<HTMLElement | null>(null)
  const pending = useRef<number | null>(null)
  useLayoutEffect(() => {
    if (focused && pending.current != null && elRef.current) placeCaretAtOffset(elRef.current, pending.current)
    pending.current = null
  }, [focused])
  return (
    <div
      ref={el => { elRef.current = el; if (el && !el.textContent) el.textContent = value }}
      contentEditable suppressContentEditableWarning spellCheck={false}
      className={className} style={style}
      onMouseDown={e => { if (!focused) pending.current = caretCharOffset(e.currentTarget, e.clientX, e.clientY) }}
      onFocus={() => setFocused(true)}
      onBlur={e => { const t = e.currentTarget.textContent ?? ''; e.currentTarget.textContent = ''; onCommit(t); setFocused(false) }}
      onInput={e => { if (focused) onCommit(e.currentTarget.textContent ?? '') }}>
      {focused ? null : (flash ? flashInline(value, boldVs, italVs, flash, cmp) : renderInline(value, boldVs, italVs, cmp))}
    </div>
  )
}

function Words({ size, ls, leading, featStr, opszAuto }: SceneProps) {
  const { state } = useInstrument()
  const op = opszCss(state.defaults, opszAuto)
  const vs = renderVarSettings(effectiveAxes(state), op.renderOpts)
  // Words/Scale only swap for a live webfont; static-SVG referents render only their
  // Paragraph specimen, so here they fall back to Cal Sans.
  const cmp = state.compareOn && state.compare?.css ? state.compare : null
  const { flashes, clear, dragging } = useGeomFlash()
  const gold = useFrozenGold(state.defaults.frozenFeatures)
  const [text, setText] = useState('2160 just Groovy, I’ll Magic')
  const [focused, setFocused] = useState(false)
  return (
    <div className="stage-pad words-scene">
      <div className="words-edit specimen edit-rail" contentEditable suppressContentEditableWarning
        style={{ fontSize: size, lineHeight: leading, textAlign: 'center', whiteSpace: 'pre-wrap', fontVariationSettings: vs, fontOpticalSizing: op.optical, fontFeatureSettings: featStr, letterSpacing: ls, ...(cmp ? compareStyle(cmp, effectiveAxes(state), { opszAuto }) : {}) }}
        onFocus={() => setFocused(true)}
        // innerText (not textContent) preserves soft line breaks: Enter inserts <br>/<div>
        // nodes that textContent would concatenate with no \n, flattening the layout.
        onBlur={e => { setText(e.currentTarget.innerText ?? ''); setFocused(false) }}>
        {/* Uncontrolled while focused: no onInput→setState, so typing never re-renders
            and never resets the caret. Text is captured on blur, then flash-wrapped. */}
        {focused ? text : flashText(text, flashes, clear, dragging, '', gold?.chars)}
      </div>
    </div>
  )
}

type EBlock = { id: string; type: Block['type']; text: string }
const presetBlocks = (source: string): EBlock[] =>
  (TEXT_PRESETS[source] ?? TEXT_PRESETS.Sample).map((b, i) => ({ id: `${source}-${i}`, type: b.type, text: b.text }))

// Compare-page font swap, sitting under the paragraph like a line of text (fused SEO
// pages only — state.compare comes from BOOT). The target name renders in the font
// you'd switch TO, so "compare to (Geist ⇄)" already shows what Geist looks like.
function CompareInline() {
  const { state, dispatch } = useInstrument()
  const cmp = state.compare
  if (!cmp) return null
  const swappable = !!cmp.css || !!cmp.svg   // live webfont OR a static specimen SVG
  // No webfont AND no rendered specimen → grayed control; the specimen above stays
  // Cal Sans tuned to resemble the referent.
  if (!swappable) {
    return (
      <div className="compare-inline compare-inline--disabled"
        title={`${cmp.label} webfont currently not available to ReCal — the specimen above is Cal Sans tuned to resemble it`}>
        compare to <span className="compare-inline-btn" aria-disabled="true">({cmp.label} ⇄)</span>
        <span className="compare-inline-note"> — webfont currently not available to ReCal</span>
      </div>
    )
  }
  const on = state.compareOn
  return (
    <div className="compare-inline">
      {on ? 'comparing — back to ' : 'compare to '}
      <button className="compare-inline-btn"
        // Live-font labels preview in that font; SVG specimens have no live face, so
        // the label stays in the UI font.
        style={{ fontFamily: on || !cmp.css ? "'CalSansPreview', 'CalSansVF', sans-serif" : cmp.family }}
        title={on ? 'Back to ReCal Sans' : `Show this text in ${cmp.label}`}
        onClick={() => dispatch({ type: 'setCompareOn', on: !on })}>
        ({on ? 'ReCal Sans' : cmp.label} ⇄)
      </button>
    </div>
  )
}

// Names the font the specimen is actually set in — flips with the toggle so the copy
// itself never has to claim "this is ReCal Sans" (which read wrong under a referent).
function CompareCaption() {
  const { state } = useInstrument()
  const cmp = state.compare
  if (!cmp) return null
  return <div className="compare-caption">Set in {state.compareOn ? cmp.label : 'ReCal Sans'}</div>
}

// Static referent specimen (Gotham/Neutraface/Circular/GT America): fetch the
// pre-rendered SVG once and inline it so fill="currentColor" inherits the theme.
function CompareSvg({ url }: { url: string }) {
  const [markup, setMarkup] = useState('')
  useEffect(() => {
    let live = true
    fetch(url).then(r => r.text()).then(t => { if (live) setMarkup(t) }).catch(() => {})
    return () => { live = false }
  }, [url])
  return <div className="compare-svg" dangerouslySetInnerHTML={{ __html: markup }} />
}

function Paragraph({ featStr, source, measure, opszAuto, paraStyles }: SceneProps) {
  const { state } = useInstrument()
  const axes = effectiveAxes(state)
  const op = opszCss(state.defaults, opszAuto)
  const boldVs = renderVarSettings({ ...axes, wght: 700 }, op.renderOpts)
  const italVs = renderVarSettings({ ...axes, ital: 1 }, op.renderOpts)
  // Comparing to a referent with a live webfont → restyle the blocks (compareStyle).
  // Comparing to a no-webfont referent with a static specimen → show the SVG instead.
  const cmp = state.compareOn && state.compare?.css ? state.compare : null
  const svgUrl = state.compareOn ? state.compare?.svg : undefined
  const flash: FlashCtx = { ...useGeomFlash(), frozen: useFrozenGold(state.defaults.frozenFeatures)?.chars }
  // On the Vertical Metrics tab, drive line spacing (vmLH) and the cap-position shift
  // (vmShift) from the chosen metrics, so a preset change reflows the paragraph and slides
  // the caps within each line — a simulation of the export's line box, no re-baking.
  const vmLH = state.railGroup === 3 ? effectiveLineHeightEm(state.defaults.vmetrics) : null
  const vmShift = state.railGroup === 3 ? capShiftEm(state.defaults.vmetrics) : 0

  const [blocks, setBlocks] = useState<EBlock[]>(() => presetBlocks(source))
  const [focusedId, setFocusedId] = useState<string | null>(null)
  const refs = useRef<Record<string, HTMLElement>>({})
  const pending = useRef<{ id: string; offset: number } | null>(null)
  const seq = useRef(0)
  // Tracks the truly-active block synchronously so a stray blur (e.g. after Enter
  // re-renders the old block styled) doesn't commit stripped text over the raw markdown.
  const activeId = useRef<string | null>(null)
  const focus = (id: string | null) => { activeId.current = id; setFocusedId(id) }

  // Reload blocks when the source preset changes.
  const prevSource = useRef(source)
  useEffect(() => {
    if (prevSource.current !== source) { prevSource.current = source; setBlocks(presetBlocks(source)); focus(null) }
  }, [source])

  // Restore caret to the click point after a block swaps to raw markdown on focus.
  useLayoutEffect(() => {
    if (focusedId && pending.current?.id === focusedId) {
      const el = refs.current[focusedId]; if (el) placeCaretAtOffset(el, pending.current.offset)
    }
    pending.current = null
  }, [focusedId])

  const onKeyDown = (id: string, e: KeyboardEvent<HTMLElement>) => {
    const el = refs.current[id]; if (!el) return
    const text = el.textContent ?? ''
    if (e.key === ' ') {
      const md = text === '#' ? 'h1' : text === '##' ? 'h2' : text === '###' ? 'h3' : null
      if (md) {
        e.preventDefault(); el.textContent = ''
        setBlocks(prev => prev.map(b => b.id === id ? { ...b, type: md, text: '' } : b))
        requestAnimationFrame(() => { const n = refs.current[id]; if (n) { n.focus(); placeCaretAtStart(n) } })
      }
    } else if (e.key === 'Enter') {
      e.preventDefault()
      el.textContent = ''   // clear before the block re-renders styled (avoids duplicate)
      const newId = `n${seq.current++}`
      setBlocks(prev => {
        const idx = prev.findIndex(b => b.id === id); if (idx < 0) return prev
        const next = [...prev]
        next[idx] = { ...next[idx], text }
        next.splice(idx + 1, 0, { id: newId, type: 'p', text: '' })
        return next
      })
      focus(newId)
      requestAnimationFrame(() => { const n = refs.current[newId]; if (n) { n.focus(); placeCaretAtStart(n) } })
    } else if (e.key === 'Backspace' && text === '') {
      e.preventDefault()
      setBlocks(prev => {
        if (prev.length <= 1) return prev
        const idx = prev.findIndex(b => b.id === id)
        const target = prev[Math.max(0, idx - 1)]
        if (target) { focus(target.id); requestAnimationFrame(() => { const n = refs.current[target.id]; if (n) { n.focus(); placeCaretAtEnd(n) } }) }
        return prev.filter(b => b.id !== id)
      })
    }
  }

  // Static specimen view: the referent has no live webfont, so show the pre-rendered
  // SVG (real outlines) in place of the editable blocks. Toggle stays available.
  if (svgUrl) {
    return (
      <div className="stage-pad">
        <div className="para-doc" style={{ maxWidth: `${measure}em` }}>
          <CompareSvg url={svgUrl} />
          <CompareCaption />
          <CompareInline />
        </div>
      </div>
    )
  }

  return (
    <div className="stage-pad">
      <div className="para-doc" style={{ maxWidth: `${measure}em` }}>
        {blocks.map(b => {
          const st = paraStyles[b.type]
          const blockVs = renderVarSettings({ ...axes, wght: st.wght }, op.renderOpts)
          const focused = focusedId === b.id
          return (
            <div key={b.id}
              ref={el => { if (el) { refs.current[b.id] = el; if (!el.textContent) el.textContent = b.text } else delete refs.current[b.id] }}
              contentEditable suppressContentEditableWarning spellCheck={false}
              className={`para-block para-block--${b.type} edit-rail`}
              style={{ fontSize: st.size, lineHeight: vmLH ?? st.leading, transform: vmShift ? `translateY(${vmShift}em)` : undefined, fontVariationSettings: blockVs, fontOpticalSizing: op.optical, fontFeatureSettings: featStr, letterSpacing: `${st.tracking / 100}em`, ...(cmp ? compareStyle(cmp, { ...axes, wght: cmp.headingWght && b.type !== 'p' ? cmp.headingWght : st.wght }, { opszAuto }) : {}) }}
              onMouseDown={e => { if (!focused) pending.current = { id: b.id, offset: caretCharOffset(e.currentTarget, e.clientX, e.clientY) } }}
              onFocus={() => focus(b.id)}
              onBlur={e => {
                if (activeId.current !== b.id) return   // stale blur (Enter moved focus) — keep raw text
                const t = e.currentTarget.textContent ?? ''
                e.currentTarget.textContent = ''
                setBlocks(prev => prev.map(x => x.id === b.id ? { ...x, text: t } : x))
                focus(null)
              }}
              onKeyDown={e => onKeyDown(b.id, e)}>
              {focused ? null : flashInline(b.text, boldVs, italVs, flash, cmp)}
            </div>
          )
        })}
        <CompareCaption />
        <CompareInline />
      </div>
    </div>
  )
}

function Scale({ featStr, pairs, measure, scaleStyles, selectedTiers }: SceneProps) {
  const { state } = useInstrument()
  const axes = effectiveAxes(state)
  const mult = state.defaults.opszMultiplier
  const boldVs = renderVarSettings({ ...axes, wght: 700 }, {})
  const italVs = renderVarSettings({ ...axes, ital: 1 }, {})
  const cmp = state.compareOn && state.compare?.css ? state.compare : null
  // Compare mode: the referent tracks size via font-optical-sizing: auto (if it has
  // opsz at all) — Cal Sans's multiplier math doesn't apply to another font.
  const cmpSt = cmp ? compareStyle(cmp, axes, { opszAuto: true }) : {}
  // Freeze pins every size to the frozen opsz; otherwise the waterfall shows opsz
  // following size (the export's multiplier). Both live in CSS now — no re-bake.
  const frozen = state.defaults.freezeOpsz ? Math.min(Math.max(state.defaults.frozenOpszValue ?? 14, 8), 45) : null
  const vsFor = (px: number) => renderVarSettings(axes, { opszOverride: frozen ?? opszForSize(px, mult) })
  const use = BODY_TIERS.filter(t => pairs.has(t.key))   // none selected → no body pairings
  const flash: FlashCtx = { ...useGeomFlash(), frozen: useFrozenGold(state.defaults.frozenFeatures)?.chars }
  const [head, setHead] = useState(HEAD_WORD)
  const [body, setBody] = useState(PAIR_BODY)
  // On the Vertical Metrics tab, line height + the cap-position shift come from the metrics
  // (a preset change reflows the waterfall and slides the caps — visible at these sizes).
  const vmLH = state.railGroup === 3 ? effectiveLineHeightEm(state.defaults.vmetrics) : null
  const vmShift = state.railGroup === 3 ? capShiftEm(state.defaults.vmetrics) : 0
  // Per-tier tracking/leading (Scale style menu); size stays Tailwind-fixed.
  const tierStyle = (key: string) => {
    const st = scaleStyles[key] ?? { tracking: 0, leading: 1.4 }
    return { letterSpacing: `${st.tracking / 100}em`, lineHeight: vmLH ?? st.leading, transform: vmShift ? `translateY(${vmShift}em)` : undefined }
  }
  return (
    <div className="stage-pad">
      {DISPLAY_TIERS.map(d => (
        <div key={d.key} className="tier-block" style={{ width: `${measure}em` }}>
          <div className="tier-label">
            <span className="tier-token tnum">{d.key}<span className="tier-px">{d.px}px</span></span>
            {use.length > 0 && (
              <span className="tier-with tnum">paired with {use.map(b => `${b.key} ${b.px}px`).join(', ')}</span>
            )}
          </div>
          {/* Headline + body are editable and synced live across every size tier. */}
          <EditableText value={head} onCommit={setHead} className={`tier-head edit-rail${selectedTiers.has(d.key) ? ' edit-rail--target' : ''}`} boldVs={boldVs} italVs={italVs} flash={flash} cmp={cmp}
            style={{ fontSize: d.px, fontVariationSettings: vsFor(d.px), fontFeatureSettings: featStr, ...tierStyle(d.key), ...cmpSt }} />
          {use.map(b => (
            <EditableText key={b.key} value={body} onCommit={setBody} className={`tier-body edit-rail${selectedTiers.has(b.key) ? ' edit-rail--target' : ''}`} boldVs={boldVs} italVs={italVs} flash={flash} cmp={cmp}
              style={{ fontSize: b.px, fontVariationSettings: vsFor(b.px), fontFeatureSettings: featStr, ...tierStyle(b.key), ...cmpSt }} />
          ))}
        </div>
      ))}
    </div>
  )
}

// Cmap the cmap once — CalSansVF is already the loaded UI font.
let cmapPromise: Promise<CmapRanges | null> | null = null
function loadCmap(): Promise<CmapRanges | null> {
  if (!cmapPromise) {
    cmapPromise = fetch(`${import.meta.env.BASE_URL}fonts/CalSansVF.ttf`)
      .then(r => r.arrayBuffer()).then(parseCmapRanges).catch(() => null)
  }
  return cmapPromise
}

function Glyphs({ featStr, glyphSet, opszAuto }: SceneProps) {
  const { state } = useInstrument()
  const op = opszCss(state.defaults, opszAuto)
  const vs = renderVarSettings(effectiveAxes(state), op.renderOpts)
  const { flashes, clear, dragging } = useGridFlash()
  const [ranges, setRanges] = useState<CmapRanges | null>(null)
  useEffect(() => { let alive = true; loadCmap().then(r => { if (alive) setRanges(r) }); return () => { alive = false } }, [])

  // "All" = every cmap codepoint + its aalt alternates (the unencoded variants);
  // the named sets are curated base-character subsets.
  const cells: GlyphCell[] = glyphSet === 'All'
    ? allGlyphsWithAlternates(ranges)
    : (GLYPH_SETS[glyphSet] ?? []).filter(g => isSupported(g, ranges)).map(ch => ({ ch, aalt: 0 }))
  return (
    <div className="stage-pad">
      <div className="glyph-grid">
        {cells.map((c, i) => {
          // aalt/case cells now enable 'rclt' too, so their GEOM swap actually renders.
          const base = c.caps ? "'case' 1" : c.aalt ? `'aalt' ${c.aalt}, 'rclt' 1` : featStr
          // Flash (hold-while-dragging / fade-on-release) any cell whose glyph rclt-swaps —
          // base OR alternate/compound (five.numr.rcltGeo…) — via the font-derived map.
          const fl = c.caps ? undefined : flashes[`${cpOf(c.ch)}:${c.aalt}`]
          return (
            <span key={`${i}-${fl?.nonce ?? 0}`}
              className={`glyph-cell${fl ? (dragging ? ' geom-flash-hold' : ' geom-flash') : ''}`}
              onAnimationEnd={fl && !dragging ? () => clear(`${cpOf(c.ch)}:${c.aalt}`) : undefined}
              style={{ fontVariationSettings: vs, fontOpticalSizing: op.optical, fontFeatureSettings: `${base}, 'mark' 1, 'mkmk' 1`, ...(fl && { ['--flash-color' as string]: fl.color }) }}>
              {c.ch}
            </span>
          )
        })}
      </div>
    </div>
  )
}

// COSS module gallery — lazy-loaded so its component + coss.css + markup ship in a
// SEPARATE chunk fetched only when the tab is first opened (replaces the old UI mock).
const CossScene = lazy(() => import('./CossScene'))

export function Scene({ mode, ...props }: { mode: SceneMode } & SceneProps) {
  switch (mode) {
    case 'words': return <Words {...props} />
    case 'paragraph': return <Paragraph {...props} />
    case 'scale': return <Scale {...props} />
    case 'glyphs': return <Glyphs {...props} />
    case 'ui': return (
      <Suspense fallback={<div className="scene-loading"><span className="mode-throb" aria-hidden /> Loading…</div>}>
        <CossScene {...props} />
      </Suspense>
    )
  }
}

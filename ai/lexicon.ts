/**
 * Weighted cue patterns per signal (EN + DE). This is the "declaration" part of the local engine:
 * which wording counts as evidence for which technique, and how strongly.
 *
 * Pattern syntax (compiled by `cue()`):
 *   - plain regex source, matched case-insensitively on whole words (unicode-aware, so umlauts work)
 *   - `~` = "any word ending", e.g. `destroy~` matches destroy / destroyed / destroying
 * Weight = how much ONE hit moves the score (0..1). Hits are combined with a noisy-OR in engine.ts,
 * so two medium cues add up, and a single weak cue never crosses the 0.5 display threshold.
 *
 * Wording principle: cues describe TECHNIQUES. No party names as "bad", no opinions.
 */
import type { SignalKey } from "@contracts";

export interface Cue {
  re: RegExp;
  weight: number;
}

const STRONG = 0.6;
const MEDIUM = 0.45;
const WEAK = 0.25;

function cue(source: string, weight: number): Cue {
  const body = source.replaceAll("~", "[\\p{L}]*");
  return { re: new RegExp(`(?<![\\p{L}\\p{N}])(?:${body})(?![\\p{L}\\p{N}])`, "giu"), weight };
}

/** For emoji / punctuation cues where word boundaries make no sense. */
function raw(re: RegExp, weight: number): Cue {
  return { re, weight };
}

/** People-group references, reused by the scapegoating / dehumanizing cues. */
const GROUP =
  "(?:they|them|these people|those people|immigrants?|migrants?|foreigners?|refugees?|the elites?|the rich|the poor|the left|the right|liberals?|conservatives?|boomers?|the media|muslims?|jews?|christians?|" +
  "diese leute|die alle|ausländer|migranten|flüchtlinge|die eliten|die linken|die rechten|die medien|die da oben)";

export const LEXICON: Partial<Record<SignalKey, Cue[]>> = {
  political_content: [
    cue("government~|election~|parliament~|congress|senate|president~|minister~|chancellor|democra~|republican~|legislation|referendum", STRONG),
    cue("regierung~|wahl|wahlen|wahlkampf|partei~|bundestag|kanzler~|politik~|abgeordnete~|koalition|afd|cdu|csu|spd|fdp|grünen?", STRONG),
    cue("politic~|policy|policies|administration|deport~|abschieb~|tariff~|sanction~|immigra~|migra~|asyl~|refugee~|flüchtling~|left-wing|right-wing|border (?:crisis|control|policy)|vote|votes|voting|voters?", MEDIUM),
    cue("our country|this country|unser land|the media|die medien|mainstream media|taxpayers?|steuerzahler", MEDIUM),
    cue("crime|tax|taxes|steuern|liberals?|conservatives?|protest~|party", WEAK),
  ],
  political_persuasion: [
    cue("vote (?:for|against|them out|him out|her out)|don'?t vote|never vote|wählt|wähl(?:en sie)?|abwählen|nicht wählbar", STRONG),
    cue("must be stopped|has to go|muss weg|müssen weg|take (?:our|the) country back|holt euch euer land zurück|save (?:our|this) country", STRONG),
    cue("stand with|stand up (?:to|against)|fight back|time we fight|wehrt euch|widerstand", MEDIUM),
  ],
  fear_framing: [
    cue("destroy~|invasion|invad~|collaps~|terror~|catastroph~|deadly|apocalyp~|zerstör~|untergang|katastroph~|bedroh~|invasion", STRONG),
    cue("danger~|threat~|not safe|unsafe|afraid|scared|terrif~|nightmare|gefahr~|gefähr~|angst|unsicher", MEDIUM),
    cue("before it'?s too late|bevor es zu spät ist|your (?:children|kids|family|job|savings)|eure kinder|deine kinder|coming for (?:you|your)", MEDIUM),
    cue("attack~|crisis|krise|kill~|dying|krieg|chaos", WEAK),
  ],
  anger_framing: [
    cue("disgust~|outrag~|furious|betray~|shameful|disgrace~|sickening|how dare|unverschämt~|skandal~|widerlich|verrat~|frechheit|schande", STRONG),
    cue("shame|sick of|fed up|enough is enough|had enough|unacceptable|es reicht|satt haben|wütend|angry|rage", MEDIUM),
  ],
  us_vs_them: [
    cue("these people|those people|people like them|their kind|diese leute|solche leute|die da oben|wir gegen die", STRONG),
    cue("real (?:americans?|patriots?|germans?|men|women|people)|echte (?:deutsche|patrioten)|the elites?|globalists?|the establishment|die eliten|das establishment|the swamp", STRONG),
    cue("our (?:country|people|way of life|culture|values|nation)|unser (?:land|volk)|unsere (?:kultur|werte|heimat)", MEDIUM),
    cue("us (?:vs\\.?|versus|against) them|they hate (?:us|you)|they think (?:we|you)|sie hassen uns", STRONG),
    cue("they|them", 0.15),
  ],
  scapegoating: [
    cue(`${GROUP} (?:are|is|sind|ist) (?:to blame|responsible|the (?:real )?problem|the reason|ruining|destroying|taking|stealing|schuld|das problem|verantwortlich)`, 0.8),
    cue(`(?:because of|thanks to|blame|wegen|dank) ${GROUP}`, STRONG),
    cue("since (?:they|these people|those people) (?:arrived|came|took over)|seit (?:die|sie) (?:hier|da) sind", 0.7),
    cue("taking our (?:jobs|homes|money|benefits)|nehmen uns (?:die|unsere) (?:jobs|arbeit|wohnungen)|on our dime|auf unsere kosten", 0.7),
  ],
  urgency_language: [
    cue("share before|before (?:it'?s|this gets|they) (?:deleted|removed|taken down|delete)|bevor (?:es|das) gelöscht wird|teilen bevor", 0.75),
    cue("act now|wake up|last chance|only \\d+ (?:left|hours?|days?)|time is running out|don'?t wait|hurry|jetzt handeln|wacht auf|wach auf|letzte chance|nur noch heute", STRONG),
    cue("right now|sofort|immediately|urgent~|now or never|today only|dringend|jetzt teilen|share this|spread the word|weitersagen", MEDIUM),
  ],
  sensationalism: [
    cue("shocking|unbelievable|you won'?t believe|mind-?blowing|insane|jaw-?dropping|bombshell|exposed|unfassbar|schockierend|unglaublich|krass|skandal~", STRONG),
    cue("breaking|eilmeldung|must see|must watch", MEDIUM),
    raw(/🤯|🚨|😱|‼️|⚠️|💥/gu, 0.35),
    raw(/[!?]{2,}/g, 0.35),
  ],
  conspiracy_framing: [
    cue("(?:won'?t|don'?t|doesn'?t|never) (?:tell|want) you|don'?t want you to (?:know|see)|wants? you to know|what they'?re hiding|they'?re hiding|is hiding|are hiding|cover-?up", 0.7),
    cue("lying to you|lied to you|the truth about|hidden truth|the real reason|open your eyes|do your own research|follow the money|false flag|deep state|plandemic|great reset|new world order", 0.7),
    cue("wollen nicht,? dass (?:du|ihr|sie)|verschweig~|vertusch~|lügenpresse|die wahrheit über|wird (?:uns|euch) verheimlicht|mainstream ?medien|gleichgeschaltet~|aufwachen", 0.7),
    cue("mainstream media|msm|censor~|zensur~|suppress~|silenced|they don'?t want|nobody is talking about|niemand spricht darüber", MEDIUM),
    cue("hiding|hidden|secret~|agenda|geheim~", WEAK),
  ],
  factual_claim: [
    raw(/\d+(?:[.,]\d+)?\s?(?:%|percent|prozent)/giu, STRONG),
    cue("\\d[\\d.,]*\\s?(?:people|times|million~|billion~|thousand|cases|deaths|menschen|fälle|tote|millionen|milliarden|mal)", STRONG),
    cue("studies show|study shows|scientists (?:say|confirm)|experts (?:say|agree)|it'?s (?:a )?(?:proven|fact)|proven fact|statistics show|studien (?:zeigen|belegen)|wissenschaftler (?:sagen|bestätigen)|fakt ist|bewiesen|nachweislich", STRONG),
    cue("(?:is|are|went|has gone|have gone) up|(?:doubled|tripled|skyrocket~|plummet~|verdoppelt|verdreifacht|explodier~)", MEDIUM),
    cue("everyone knows|jeder weiß|always|never|nobody|no one|100 ?%", 0.2),
  ],
  personal_attack: [
    cue("(?:he|she|you|this (?:guy|man|woman|clown)|@\\w+) (?:is|are) (?:just |such |really )?(?:an? )?(?:total |complete |absolute |fucking )?(?:idiot|moron|clown|liar|loser|fraud|crook|traitor|coward|joke|disgrace|psychopath|puppet)", 0.85),
    cue("(?:du|er|sie|der|die) (?:ist|bist) (?:ein|eine) (?:idiot|lügner~|versager~|verräter~|clown|witzfigur|marionette|heuchler~)", 0.85),
    cue("idiot~|moron~|clown~|liar~|loser~|fraud|crook~|traitor~|coward~|pathetic|braindead|brain-?dead|stupid|dumb|lügner~|versager~|verräter~|heuchler~|dumm~|witzfigur", 0.5),
    cue("shut up|halt(?:'s)? maul|halt die klappe|sleepy|crooked|crazy", MEDIUM),
  ],
  dehumanizing_language: [
    cue(`${GROUP} (?:are|is|sind|ist) (?:just |nothing but |all |nur |nichts als )?(?:animals?|vermin|parasites?|cockroach~|rats|scum|filth|trash|garbage|savages?|a (?:plague|virus|disease|cancer|infestation)|tiere|ungeziefer|parasiten|ratten|abschaum|dreck|pack|eine (?:plage|seuche))`, 0.9),
    cue("subhuman~|untermensch~|sub-human|infest~|vermin|cockroach~|ungeziefer|abschaum|gesindel|viehzeug", 0.55),
    cue("parasit~|scum|savages?|breed like|swarm~ of (?:migrants|people)|flood of (?:migrants|refugees)|flut von|invasoren", MEDIUM),
  ],
  engagement_bait: [
    cue("like and (?:rt|share|retweet|follow)|rt if|retweet if|share if|like if|comment (?:below|\"?\\w+\"? (?:and|to))|tag (?:a friend|someone)|follow (?:for|me for)|drop a|double tap|smash (?:that|the) like", 0.7),
    cue("liken und teilen|teilen wenn|markiere (?:jemanden|einen freund)|folg(?:e|t) (?:mir )?für|kommentier~ (?:mit|unten)|schreib(?:t)? (?:es )?in die kommentare", 0.7),
    cue("agree\\?|who else|am i the only one|thoughts\\?|bin ich der einzige|wer noch|wait for it|watch (?:till|until) the end|bis zum ende", MEDIUM),
    raw(/🧵|👇{1,}/gu, 0.35),
    cue("fyp|foryou|foryoupage|viral|fürdich", WEAK),
  ],
  commercial_persuasion: [
    cue("link in (?:my )?bio|use (?:my )?code|promo ?code|discount~|\\d+ ?% off|buy now|shop now|order now|limited (?:time )?offer|free shipping|rabatt~|gutscheincode|jetzt (?:kaufen|bestellen|sichern)|angebot", 0.7),
    cue("sponsored|#ad|#anzeige|#werbung|anzeige|affiliate|partnered with|in partnership with|dm me (?:to|for)|sign up (?:now|today)|join my (?:course|program|newsletter)|passive income|get rich|financial freedom", STRONG),
    cue("\\$\\d+|\\d+ ?€|giveaway|gewinnspiel|crypto|invest~|side hustle", WEAK),
  ],
  possible_ai_slop: [
    cue("in today'?s (?:fast-paced|digital|ever-changing|modern) (?:world|age|landscape)|in der heutigen (?:schnelllebigen )?(?:welt|zeit)", 0.75),
    cue("game-?chang~|unlock~ (?:your|the) (?:potential|power|secrets?)|delve|tapestry|testament to|ever-evolving|navigat~ the (?:complex~|world|landscape)|let'?s dive in|elevate your|supercharge|revolutioni[sz]e", STRONG),
    cue("here are \\d+ (?:tips|ways|secrets|lessons|reasons|things|habits)|\\d+ (?:tips|ways|secrets|habits|lessons) (?:to|that|for)|hier sind \\d+ (?:tipps|wege|gründe)", STRONG),
    cue("it'?s not (?:just|about) [^.!?]{3,40}[,—-] it'?s|more important than ever|wichtiger denn je|in conclusion|key takeaways?|remember:|here'?s the thing", MEDIUM),
    raw(/—/g, 0.12),
  ],
};

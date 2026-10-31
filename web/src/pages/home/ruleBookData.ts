export type Rule = {
  number: number;
  title: string;
  body: string;
  bullets?: string[];
  note?: string;
};

/** Same content as mobile RuleBookScreen — Mindset tab. */
export const MINDSET_RULES: Rule[] = [
  {
    number: 1,
    title: 'Review Every Custom Match',
    body: 'Har custom ke baad apni mistakes discuss karo. Sirf galti point out mat karo — uska reason samjho aur next match mein usse improve karo. Blame nahi, solutions chahiye.',
  },
  {
    number: 2,
    title: 'Never Give Up on a Match Set',
    body: 'Agar kisi round mein 6 matches hain, toh saare 6 matches khelne hain, chahe tum leaderboard par bottom par hi kyun na ho. Har match ek naya opportunity hai. Bad performance ke baad quit karna option nahi hai.',
  },
  {
    number: 3,
    title: 'Never Underestimate Any Lobby',
    body: 'Lobby weak ho ya strong, apne game plan aur discipline ko same rakho. Weak lobby mein careless hue toh strong lobby mein pressure handle nahi kar paoge.',
  },
  {
    number: 4,
    title: 'Never Get Intimidated by Good Players',
    body: 'Lobby mein kisi famous ya high-level player ko dekhkar apne mind mein yeh mat banao ki tum usse nahi jeet sakte. Player ki reputation nahi, situation aur gameplay matter karta hai.',
  },
  {
    number: 5,
    title: 'Respect Every Opponent',
    body: 'Agar opponent trash talk kar raha hai, toh ignore karo aur apne gameplay par focus rakho. Arguments aur unnecessary reactions se focus kharab hota hai. Apna jawab gameplay se do, words se nahi.',
  },
  {
    number: 6,
    title: 'Learn from Your Idols',
    body: 'Apne favourite professional players ke gameplay se motivation lo. Sirf unka gameplay copy mat karo — analyse karo ki unhone woh decision kyun liya, kab fight li, kab avoid ki aur rotation kaise ki.',
  },
  {
    number: 7,
    title: 'Keep Your Ego Under Control',
    body: 'Confidence rakho, overconfidence nahi. Mindset hona chahiye: “Next match mein aur better karenge.” Apne gameplay ko prove karne ke liye unnecessary fights mat lo. Results aur consistency tumhara jawab honge.',
  },
  {
    number: 8,
    title: 'Accept Responsibility',
    body: 'Har mistake ke liye teammate, IGL, zone ya luck ko blame mat karo. Pehle apna decision analyse karo. Agar galti team ki hai, toh collectively solution nikalo.',
  },
  {
    number: 9,
    title: 'Stay Calm Under Pressure',
    body: 'Bad start, early elimination, low kills ya back-to-back losses ke baad panic mat karo. Reset your mind, communicate clearly aur next match ko fresh start samjho.',
  },
  {
    number: 10,
    title: 'Team Comes Before Individual Ego',
    body: 'Personal kill count ya MVP banne se zyada important team ka result hai. Trade, cover, support aur sacrifice ki zarurat ho toh team ke liye karo.',
  },
  {
    number: 11,
    title: 'Be Punctual and Accountable',
    body: 'Practice aur official match ke time par ready raho. Late aana, bina inform kiye absent hona aur practice ke beech mein disappear hona team discipline ke against hai.',
  },
  {
    number: 12,
    title: 'Be Open to Feedback',
    body: 'Coach, IGL ya teammate ki valid criticism ko personally mat lo. Har feedback par discuss karo, improve karo aur same mistake baar-baar repeat mat karo.',
  },
];

/** Same content as mobile RuleBookScreen — Gameplay tab. */
export const GAMEPLAY_RULES: Rule[] = [
  {
    number: 1,
    title: 'Follow a Fixed Official Match Routine',
    body: 'Official tournaments ke liye pehle 5-match sets par practice karo.',
    bullets: [
      'Initial target: 30–35 total team kills across 5 matches.',
      'Next milestone: 40–45 total team kills across 5 matches.',
      'Saath mein placement, survival, rotations aur decision-making par bhi focus rakho.',
      'Back-to-back Booyahs ko ek bonus performance target ki tarah chase karo, lekin unnecessary risks lekar nahi.',
    ],
    note: 'Kill targets practice benchmarks hain, har lobby mein guaranteed result nahi.',
  },
  {
    number: 2,
    title: 'Never Take an Unplanned Fight',
    body: 'Open rush tabhi karo jab proper information, utility, numbers advantage ya teammate support ho. Sirf knock ya kill dekhkar blindly push mat karo.',
  },
  {
    number: 3,
    title: 'Prioritise Information Before Engagement',
    body: 'Enemy ki exact position, number, cover aur possible third-party risk samjho. Fight start karne se pehle decide karo ki knock milne par push karna hai ya position hold karni hai.',
  },
  {
    number: 4,
    title: 'Use Individual Landings with Team Coordination',
    body: 'Landing ke time players ko nearby, useful loot areas mein spread karo, taaki early loot fast ho aur team zyada area cover kar sake. Lekin itna spread mat ho ki teammates ko emergency mein support ya trade na mil sake.',
  },
  {
    number: 5,
    title: 'Scout, Loot and Regroup Efficiently',
    body: 'Looting ko unnecessary long mat karo. Basic weapons, ammo, heals aur required utility milne ke baad regroup ya next rotation ki planning karo. Enemy information ke liye scouting aur available game information ka smart use karo.',
  },
  {
    number: 6,
    title: 'Play Together in the Final 2–3 Zones',
    body: 'Endgame mein team coordination sabse important hai. Unnecessary solo pushes avoid karo, teammates ke close raho, crossfire banao aur knocks ko trade ya secure karne ke liye coordinated action lo.',
  },
  {
    number: 7,
    title: 'Master Every Gun',
    body: 'Har gun category ki regular practice karo, chahe tumhara role kuch bhi ho. Match mein preferred weapon na mile toh performance collapse nahi honi chahiye. Apne aim, recoil control, tracking aur weapon switching par kaam karo.',
  },
  {
    number: 8,
    title: 'Maintain Proper Range and Cover',
    body: 'Long-range damage aur safe positioning ka advantage lo. Close-range fights ke liye bhi prepared raho. Sniper ya DMR cover available ho toh teammates ke angles coordinate karo, enemies ko favourable positions se engage karo aur unnecessary open exposure avoid karo.',
  },
  {
    number: 9,
    title: 'Play According to Your Role',
    body: 'IGL, assaulter, support, scout ya fragger — har player ko apni responsibility pata honi chahiye. Fight ke beech role confusion se bachne ke liye responsibilities pehle se clear rakho.',
  },
  {
    number: 10,
    title: 'Communicate with Useful Callouts',
    body: 'Callouts short, clear aur actionable rakho: enemy location, knock, damage, direction, number of players aur required support. Fight ke time unnecessary shouting aur overlapping communication avoid karo.',
  },
  {
    number: 11,
    title: 'Trade Your Teammates',
    body: 'Agar teammate engage ho raha hai, toh possible ho toh usko cover ya trade do. Ek player ko bina support ke fight mein chhodna avoid karo. Lekin trade karne ke liye blindly same angle se peek mat karo.',
  },
  {
    number: 12,
    title: 'Respect Zone Timing and Rotations',
    body: 'Zone ke last moment tak wait karke panic rotation karne ki habit mat banao. Zone timing, vehicle availability, terrain aur enemy positions ko consider karke rotation plan karo. Har rotation ka purpose hona chahiye.',
  },
  {
    number: 13,
    title: 'Position Before Kills',
    body: 'Har enemy ko chase karna zaroori nahi. Strong compound, playable cover, zone advantage aur endgame position kabhi-kabhi extra kills se zyada valuable hote hain.',
  },
  {
    number: 14,
    title: 'Practise BR and Customs Consistently',
    body: 'BR grind aur custom practice dono ke liye fixed schedule banao. Ek common time decide karo jab maximum team members available hon. Regular practice ko priority do; special availability ya unavoidable issues ko exception samjho.',
  },
  {
    number: 15,
    title: 'Follow the 5-Match Practice Block',
    body: 'Ek focused 5-match set complete karo. Uske baad break lo, mistakes review karo aur agar time aur energy available ho toh next 5-match set start karo. Har set ka objective clear hona chahiye — kills, rotations, fights ya endgame improvement.',
  },
  {
    number: 16,
    title: 'Analyse Every Fight',
    body: 'Har important fight ke baad yeh review karo:',
    bullets: [
      'Fight lena sahi decision tha ya nahi?',
      'Position aur cover kaisa tha?',
      'Kya teammates trade kar sakte the?',
      'Kya utility aur communication sahi thi?',
      'Kya fight avoid karke better placement mil sakti thi?',
    ],
  },
  {
    number: 17,
    title: 'Track Performance, Not Just Kills',
    body: 'Practice ke baad team kills, placement, survival, unnecessary knocks, early eliminations, rotation mistakes aur successful endgames record karo. Progress ko multiple matches ke results se judge karo, ek match se nahi.',
  },
  {
    number: 18,
    title: 'Use Scrims to Test Strategies',
    body: 'Scrims mein sirf kills chase mat karo. Drop locations, rotations, compound choices, team spacing, utility usage aur endgame plans test karo. Jo strategy work kare usse refine karo; jo fail ho uska reason samjho.',
  },
  {
    number: 19,
    title: 'Prepare for Every Official Match',
    body: 'Match se pehle device, internet, controls, sensitivity, audio, battery aur required setup check karo. Drop plan, role responsibilities aur basic rotation strategy clear honi chahiye.',
  },
  {
    number: 20,
    title: 'Maintain Healthy Practice Habits',
    body: 'Practice ke beech appropriate breaks lo, proper sleep maintain karo aur fatigue mein mindless grinding avoid karo. Consistency ke liye focused practice, recovery aur discipline teeno zaroori hain.',
  },
];

export const FINAL_PRINCIPLE_LINES = [
  'Discipline creates consistency. Consistency builds confidence. Teamwork wins matches.',
  'No excuses. No unnecessary ego. No quitting after a bad match.',
  'Har player ka goal sirf better fragger banna nahi, balki better teammate, smarter decision-maker aur more consistent competitor banna hai.',
  'Sacred Esports — Improve Every Match. Perform as One.',
];

/**
 * Condensed from Garena Free Fire World Series official competition rulebooks
 * (FFWS Africa 2026 Fall / MENA 2026 Spring). For study — always follow the
 * live event PDF for that tournament.
 */
export const OFFICIAL_FF_RULES: Rule[] = [
  {
    number: 1,
    title: 'Official map pool (2026 FFWS)',
    body: 'Current competitive BR map pool used in FFWS 2026 regional rulebooks:',
    bullets: [
      'Bermuda',
      'Purgatory',
      'Kalahari',
      'NeXTerra',
      'Solara',
    ],
    note: 'Alpine has been removed from the FFWS 2026 map pool (Africa Fall / MENA Spring rulebooks).',
  },
  {
    number: 2,
    title: 'Match definition',
    body: 'A Battle Royale match is one competitive map played by up to 12 squads (4 players each) until a Booyah is achieved. Daily stages typically run 6 maps; Grand Finals may extend (e.g. BO8) depending on the event format.',
  },
  {
    number: 3,
    title: 'Battle Royale scoring table',
    body: 'FFWS uses placement points plus eliminations:',
    bullets: [
      '1st: 12 · 2nd: 9 · 3rd: 8 · 4th: 7 · 5th: 6 · 6th: 5',
      '7th: 4 · 8th: 3 · 9th: 2 · 10th: 1 · 11th–12th: 0',
      '1 point per elimination (in addition to placement).',
    ],
  },
  {
    number: 4,
    title: 'Tiebreakers',
    body: 'If teams are tied on total points after a series:',
    bullets: [
      '1) Higher Booyah count',
      '2) Higher total eliminations in the series',
      '3) Better placement in the last match of the series',
    ],
  },
  {
    number: 5,
    title: 'Typical in-game configuration',
    body: 'Common FFWS lobby settings from official rulebooks:',
    bullets: [
      'No Weapon Stats',
      'Revival System — On',
      'In-game Mission — On · In-match Quest — Off',
      'High tier loot zone — Off · Death Cam — Off',
      'Standardised opponent costumes (gloo / loot box / backpack, etc.)',
      'Hide player nickname & kill feed info',
      'Loadouts allowed',
    ],
  },
  {
    number: 6,
    title: 'Devices & clients',
    body: 'Players must compete on personal mobile devices with the official Free Fire client.',
    bullets: [
      'Emulators / PC clients are strictly prohibited.',
      'No modified clients, unauthorised apps, or device performance tools.',
      'All required DLC / resources must be downloaded before matches.',
      'Officials may request device verification or screenshots at any time.',
    ],
  },
  {
    number: 7,
    title: 'Substitutions',
    body: 'Teams may substitute only from the registered roster (typically up to 6 players). Substitutions must be declared to officials immediately after a match — late requests are rejected and the prior lineup continues.',
  },
  {
    number: 8,
    title: 'Integrity — prohibited during matches',
    body: 'Serious violations include (non-exhaustive):',
    bullets: [
      'Watching live streams / spectator feeds / other screens for info',
      'Secondary devices used to gain an advantage',
      'Account sharing or identity fraud',
      'Exploiting prohibited bugs or unintended mechanics',
      'Deliberate disconnect / match abandonment',
      'Unauthorised streaming or recording without Garena approval',
    ],
    note: 'Penalties range from warnings and point deductions to disqualification, prize forfeiture, and multi-year bans.',
  },
  {
    number: 9,
    title: 'Punctuality & readiness',
    body: 'Teams must report on schedule. Setup issues that should have been checked before match time are not valid grounds for remake. By starting a match, players confirm their device, client, and connection are ready.',
  },
  {
    number: 10,
    title: 'Always use the live event rulebook',
    body: 'Formats, map order (fixed vs randomised), roster size, and penalties can differ by region and split. Before any official cup, download that event’s Garena PDF and follow it over this summary.',
  },
];

import React, { useState } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { SegmentedTabs } from '../ui/SegmentedTabs';
import { FadeSwap } from '../ui/FadeSwap';
import { colors } from '../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'RuleBook'>;

type RuleBookTab = 'mindset' | 'gameplay' | 'principle';

type Rule = {
  number: number;
  title: string;
  body: string;
  bullets?: string[];
  note?: string;
};

const MINDSET_RULES: Rule[] = [
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

const GAMEPLAY_RULES: Rule[] = [
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

const FINAL_PRINCIPLE_LINES = [
  'Discipline creates consistency. Consistency builds confidence. Teamwork wins matches.',
  'No excuses. No unnecessary ego. No quitting after a bad match.',
  'Har player ka goal sirf better fragger banna nahi, balki better teammate, smarter decision-maker aur more consistent competitor banna hai.',
  'Sacred Esports — Improve Every Match. Perform as One.',
];

function SectionHeader({
  eyebrow,
  title,
  countLabel,
}: {
  eyebrow: string;
  title: string;
  countLabel: string;
}) {
  return (
    <View style={styles.sectionHeader}>
      <View style={styles.sectionHeaderText}>
        <Text style={styles.partLabel}>{eyebrow}</Text>
        <Text style={styles.partTitle}>{title}</Text>
      </View>
      <View style={styles.countPill}>
        <Text style={styles.countPillText}>{countLabel}</Text>
      </View>
    </View>
  );
}

function RuleList({ rules }: { rules: Rule[] }) {
  return (
    <View style={styles.ruleList}>
      {rules.map((rule) => (
        <View key={rule.number} style={styles.ruleCard}>
          <View style={styles.ruleHeader}>
            <View style={styles.ruleNum}>
              <Text style={styles.ruleNumText}>{rule.number}</Text>
            </View>
            <Text style={styles.ruleTitle}>{rule.title}</Text>
          </View>
          <Text style={styles.ruleBody}>{rule.body}</Text>
          {rule.bullets?.map((item) => (
            <View key={item} style={styles.bulletRow}>
              <Text style={styles.bullet}>•</Text>
              <Text style={styles.bulletText}>{item}</Text>
            </View>
          ))}
          {rule.note ? <Text style={styles.note}>Note: {rule.note}</Text> : null}
        </View>
      ))}
    </View>
  );
}

export function RuleBookScreen(_props: Props) {
  const [tab, setTab] = useState<RuleBookTab>('mindset');

  return (
    <Screen>
      <ScrollView
        style={styles.scroll}
        contentContainerStyle={styles.content}
        showsVerticalScrollIndicator={false}
        keyboardShouldPersistTaps="handled"
      >
        <Text style={styles.subtitle}>
          Rules every competitive player must follow
        </Text>

        <SegmentedTabs
          value={tab}
          onChange={setTab}
          tabs={
            [
              { value: 'mindset', label: 'Mindset' },
              { value: 'gameplay', label: 'Gameplay' },
              { value: 'principle', label: 'Principle' },
            ] as const
          }
        />

        <FadeSwap contentKey={tab}>
          {tab === 'mindset' && (
            <View>
              <SectionHeader
                eyebrow="Part 1"
                title="Mindset & Discipline"
                countLabel={`${MINDSET_RULES.length} rules`}
              />
              <RuleList rules={MINDSET_RULES} />
            </View>
          )}

          {tab === 'gameplay' && (
            <View>
              <SectionHeader
                eyebrow="Part 2"
                title="Gameplay & Practice"
                countLabel={`${GAMEPLAY_RULES.length} rules`}
              />
              <RuleList rules={GAMEPLAY_RULES} />
            </View>
          )}

          {tab === 'principle' && (
            <View>
              <SectionHeader
                eyebrow="Closing"
                title="Final Team Principle"
                countLabel="1 focus"
              />
              <View style={styles.principleCard}>
                {FINAL_PRINCIPLE_LINES.map((line, index) => (
                  <View
                    key={line}
                    style={[
                      styles.principleRow,
                      index === FINAL_PRINCIPLE_LINES.length - 1 &&
                        styles.principleRowLast,
                    ]}
                  >
                    <Text style={styles.principleLine}>{line}</Text>
                  </View>
                ))}
              </View>
            </View>
          )}
        </FadeSwap>
      </ScrollView>
    </Screen>
  );
}

const styles = StyleSheet.create({
  scroll: { flex: 1 },
  content: { padding: 20, paddingBottom: 48 },
  subtitle: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: 12,
  },
  sectionHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: 12,
    marginBottom: 16,
  },
  sectionHeaderText: { flex: 1, minWidth: 0 },
  partLabel: {
    color: colors.chrome,
    fontWeight: '700',
    fontSize: 11,
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 4,
  },
  partTitle: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 20,
    letterSpacing: -0.3,
  },
  countPill: {
    paddingVertical: 6,
    paddingHorizontal: 10,
    borderRadius: 999,
    backgroundColor: 'rgba(201,204,209,0.14)',
    borderWidth: 1,
    borderColor: 'rgba(201,204,209,0.22)',
  },
  countPillText: {
    color: colors.chrome,
    fontWeight: '700',
    fontSize: 11,
  },
  ruleList: { gap: 10 },
  ruleCard: {
    padding: 14,
    borderRadius: 14,
    backgroundColor: 'rgba(255,255,255,0.035)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
  },
  ruleHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 8,
  },
  ruleNum: {
    minWidth: 30,
    height: 30,
    borderRadius: 10,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(201,204,209,0.16)',
  },
  ruleNumText: {
    color: colors.chrome,
    fontWeight: '800',
    fontSize: 13,
  },
  ruleTitle: {
    flex: 1,
    color: colors.text,
    fontWeight: '700',
    fontSize: 15,
    lineHeight: 22,
    paddingTop: 4,
  },
  ruleBody: {
    color: colors.textMuted,
    fontSize: 14,
    lineHeight: 22,
  },
  bulletRow: {
    flexDirection: 'row',
    gap: 8,
    marginTop: 8,
    paddingRight: 4,
  },
  bullet: { color: colors.chrome, fontSize: 14, lineHeight: 21 },
  bulletText: {
    flex: 1,
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 21,
  },
  note: {
    marginTop: 10,
    color: colors.textDim,
    fontSize: 12,
    lineHeight: 18,
    fontStyle: 'italic',
  },
  principleCard: {
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(201,204,209,0.22)',
    backgroundColor: 'rgba(201,204,209,0.08)',
  },
  principleRow: {
    paddingHorizontal: 16,
    paddingVertical: 14,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: 'rgba(255,255,255,0.08)',
  },
  principleRowLast: { borderBottomWidth: 0 },
  principleLine: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 23,
    fontWeight: '600',
  },
});

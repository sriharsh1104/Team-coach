import React, { useEffect, useRef, useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { PLACEMENT_POINTS, ELIMINATION_POINTS } from '../../data/pointsTable';
import {
  CalcMatch,
  CalcTable,
  MAX_CALC_MATCHES,
  MAX_CALC_TABLES,
  MAX_KILLS_PER_MATCH,
  formatSummary,
  matchPoints,
  newMatch,
  newTable,
  ParsedSummary,
  seriesTotals,
} from '../../data/pointsCalculator';
import { loadCalcTables, saveCalcTables } from '../../data/pointsCalcStorage';
import { ThemeColors } from '../../theme';
import { useTheme } from '../../theme/ThemeContext';
import { useThemedStyles } from '../../theme/useThemedStyles';
import { AppIcon } from '../../ui/AppIcon';
import { IconActionButton } from '../../ui/IconActionButton';

type Props = {
  visible: boolean;
  onClose: () => void;
  /** Post the formatted summary into the current chat. */
  onSendToChat: (text: string) => void;
  /**
   * Continue a table that was already posted in the chat: opens just that
   * table with its matches plus an empty next match, and sends the updated
   * summary. Saved tables are left alone.
   */
  seed?: ParsedSummary | null;
};

/**
 * Instant points calculator driven by the official Points Table
 * (placement points + 1 per elimination).
 *
 * Each "points table" is its own section: pick placement + kills per match and
 * its per-match + total points update live. "Add match" only adds inside that
 * table; "New points table" starts a separate one that never mixes with the
 * previous tables.
 */
function tableFromSeed(seed: ParsedSummary): CalcTable {
  return {
    id: `seed:${Date.now()}`,
    // Keep every prior match from the chat bubble, then append one empty slot
    // for the next match the user is about to fill.
    matches: [...seed.matches, newMatch()].slice(0, MAX_CALC_MATCHES),
  };
}

export function PointsCalculatorModal({ visible, onClose, onSendToChat, seed = null }: Props) {
  const { colors } = useTheme();
  const styles = useThemedStyles(calcStyles);
  // Seeded opens start with prior matches already present so Match 1 is never
  // wiped by leftover saved tables from a previous session.
  const [tables, setTables] = useState<CalcTable[]>(() =>
    seed ? [tableFromSeed(seed)] : [newTable()],
  );
  // If the user taps before the saved tables finish loading, keep their edits.
  const edited = useRef(!!seed);
  const loadGen = useRef(0);
  const seeded = !!seed;
  const scrollRef = useRef<ScrollView>(null);
  // Jump to the bottom (newest match + Send) once the next layout pass happens.
  const stickToEnd = useRef(!!seed);

  // Every time the sheet opens: either continue the table from the chat, or
  // restore the saved tables so a match can be added later.
  useEffect(() => {
    if (!visible) {
      loadGen.current += 1;
      return;
    }
    const gen = ++loadGen.current;
    if (seed) {
      edited.current = true;
      stickToEnd.current = true;
      setTables([tableFromSeed(seed)]);
      return;
    }
    edited.current = false;
    void loadCalcTables().then((saved) => {
      // Ignore stale loads from a previous open / a seed open that replaced this one.
      if (gen !== loadGen.current || edited.current) return;
      setTables(saved);
    });
  }, [visible, seed]);

  const commit = (next: CalcTable[]) => {
    edited.current = true;
    setTables(next);
    if (!seeded) void saveCalcTables(next);
  };

  const setMatches = (tableIndex: number, matches: CalcMatch[]) =>
    commit(tables.map((t, i) => (i === tableIndex ? { ...t, matches } : t)));

  const patch = (tableIndex: number, matchIndex: number, change: Partial<CalcMatch>) =>
    setMatches(
      tableIndex,
      tables[tableIndex].matches.map((m, i) => (i === matchIndex ? { ...m, ...change } : m)),
    );

  return (
    <Modal visible={visible} transparent animationType="slide" onRequestClose={onClose}>
      <View style={staticStyles.backdrop}>
        <View style={styles.sheet}>
          <View style={staticStyles.header}>
            <View style={{ flex: 1 }}>
              <Text style={styles.title}>Points Calculator</Text>
              <Text style={styles.sub}>
                {seeded
                  ? 'Add the next match, then send the updated table'
                  : `Placement points + ${ELIMINATION_POINTS} pt per kill (official Points Table)`}
              </Text>
            </View>
            <IconActionButton plain icon="close" label="Close calculator" onPress={onClose} />
          </View>

          <ScrollView
            ref={scrollRef}
            style={staticStyles.scroll}
            contentContainerStyle={staticStyles.scrollContent}
            keyboardShouldPersistTaps="handled"
            showsVerticalScrollIndicator
            onContentSizeChange={() => {
              if (stickToEnd.current) {
                stickToEnd.current = false;
                scrollRef.current?.scrollToEnd({ animated: true });
              }
            }}
          >
            {tables.map((table, ti) => {
              const t = ti + 1;
              const totals = seriesTotals(table.matches);
              const tableTitle = seed?.title ?? `Points Table ${t}`;
              const summary = formatSummary(table.matches, tableTitle);
              return (
                <View key={table.id} style={styles.section}>
                  <View style={staticStyles.cardHead}>
                    <Text style={styles.sectionTitle}>{tableTitle}</Text>
                    {tables.length > 1 && !seeded ? (
                      <IconActionButton
                        icon="trash-outline"
                        label={`Delete table ${t}`}
                        tooltip="Delete this table"
                        danger
                        onPress={() => commit(tables.filter((_, i) => i !== ti))}
                      />
                    ) : null}
                  </View>

                  {table.matches.map((m, index) => {
                    const p = matchPoints(m);
                    const n = index + 1;
                    return (
                      <View key={index} style={styles.card}>
                        <View style={staticStyles.cardHead}>
                          <Text style={styles.cardTitle}>Match {n}</Text>
                          <Text style={styles.cardPts}>
                            {m.rank == null ? 'Pick placement' : `${p.total} pts`}
                          </Text>
                          {table.matches.length > 1 ? (
                            <IconActionButton
                              icon="trash-outline"
                              label={`Remove table ${t} match ${n}`}
                              tooltip="Remove match"
                              danger
                              onPress={() =>
                                setMatches(ti, table.matches.filter((_, i) => i !== index))
                              }
                            />
                          ) : null}
                        </View>

                        <Text style={styles.fieldLabel}>Placement</Text>
                        <View style={staticStyles.chips}>
                          {PLACEMENT_POINTS.map((row) => {
                            const on = m.rank === row.rank;
                            return (
                              <Pressable
                                key={row.rank}
                                style={[styles.chip, on && styles.chipOn]}
                                onPress={() => patch(ti, index, { rank: row.rank })}
                                accessibilityRole="button"
                                accessibilityState={{ selected: on }}
                                accessibilityLabel={`Table ${t} match ${n} placement ${row.rank}`}
                              >
                                <Text style={[styles.chipText, on && styles.chipTextOn]}>
                                  {row.rank}
                                </Text>
                              </Pressable>
                            );
                          })}
                        </View>

                        <Text style={styles.fieldLabel}>Kills</Text>
                        <View style={staticStyles.stepper}>
                          <Pressable
                            style={styles.stepBtn}
                            onPress={() => patch(ti, index, { kills: Math.max(0, m.kills - 1) })}
                            accessibilityRole="button"
                            accessibilityLabel={`Fewer kills table ${t} match ${n}`}
                          >
                            <Text style={styles.stepText}>−</Text>
                          </Pressable>
                          <Text
                            style={styles.killValue}
                            accessibilityLabel={`Table ${t} match ${n} kills ${m.kills}`}
                          >
                            {m.kills}
                          </Text>
                          <Pressable
                            style={styles.stepBtn}
                            onPress={() =>
                              patch(ti, index, {
                                kills: Math.min(MAX_KILLS_PER_MATCH, m.kills + 1),
                              })
                            }
                            accessibilityRole="button"
                            accessibilityLabel={`More kills table ${t} match ${n}`}
                          >
                            <Text style={styles.stepText}>+</Text>
                          </Pressable>
                          {m.rank != null ? (
                            <Text style={styles.breakdown}>
                              {p.placement} placement + {p.kills} kills
                            </Text>
                          ) : null}
                        </View>
                      </View>
                    );
                  })}

                  {table.matches.length < MAX_CALC_MATCHES ? (
                    <Pressable
                      style={styles.addBtn}
                      onPress={() => {
                        stickToEnd.current = true;
                        setMatches(ti, [...table.matches, newMatch()]);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Add match to table ${t}`}
                    >
                      <AppIcon name="add-circle-outline" size={20} color={colors.link} />
                      <Text style={styles.addText}>Add match {table.matches.length + 1}</Text>
                    </Pressable>
                  ) : null}

                  <View style={styles.totalBox}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.totalLabel}>Table {t} total</Text>
                      <Text
                        style={styles.totalValue}
                        accessibilityLabel={`Table ${t} total ${totals.total} points`}
                      >
                        {totals.total}
                      </Text>
                      <Text style={styles.totalSub}>
                        {totals.placement} placement + {totals.kills} kills
                        {totals.booyahs ? ` · ${totals.booyahs} Booyah` : ''}
                      </Text>
                    </View>
                    {!seeded ? (
                      <Pressable
                        style={styles.ghostBtn}
                        onPress={() => setMatches(ti, [newMatch()])}
                        accessibilityRole="button"
                        accessibilityLabel={`Reset table ${t}`}
                      >
                        <Text style={styles.ghostText}>Reset</Text>
                      </Pressable>
                    ) : null}
                    <Pressable
                      style={[styles.sendBtn, !summary && staticStyles.dim]}
                      disabled={!summary}
                      onPress={() => {
                        onSendToChat(summary);
                        onClose();
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Send table ${t} to chat`}
                    >
                      <AppIcon name="send" size={16} color={colors.chromeInk} />
                      <Text style={styles.sendText}>Send</Text>
                    </Pressable>
                  </View>
                </View>
              );
            })}

            {tables.length < MAX_CALC_TABLES && !seeded ? (
              <Pressable
                style={[styles.addBtn, styles.newTableBtn]}
                onPress={() => commit([...tables, newTable()])}
                accessibilityRole="button"
                accessibilityLabel="New points table"
              >
                <AppIcon name="add-circle" size={20} color={colors.chromeInk} />
                <Text style={styles.newTableText}>New points table (starts fresh)</Text>
              </Pressable>
            ) : null}
          </ScrollView>
        </View>
      </View>
    </Modal>
  );
}

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.6)', justifyContent: 'flex-end' },
  header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
  // flexShrink: the sheet has a maxHeight — without it the list never shrinks to fit,
  // so it is clipped and cannot scroll down to Kills / Send.
  scroll: { flexGrow: 0, flexShrink: 1 },
  scrollContent: { paddingBottom: 32 },
  cardHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: 10, flexWrap: 'wrap' },
  dim: { opacity: 0.4 },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function calcStyles(c: ThemeColors) {
  return {
    sheet: {
      backgroundColor: c.bg,
      borderTopLeftRadius: 20,
      borderTopRightRadius: 20,
      padding: 16,
      paddingBottom: 24,
      maxHeight: '88%' as const,
      borderTopWidth: 1,
      borderColor: c.border,
    },
    title: { color: c.text, fontSize: 18, fontWeight: '800' as const },
    sub: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    card: {
      backgroundColor: c.surface,
      borderRadius: 14,
      borderWidth: 1,
      borderColor: c.border,
      padding: 12,
      marginBottom: 10,
    },
    cardTitle: { color: c.text, fontWeight: '800' as const, fontSize: 15, flex: 1 },
    cardPts: { color: c.chrome, fontWeight: '800' as const, fontSize: 15 },
    fieldLabel: {
      color: c.textDim,
      fontSize: 11,
      fontWeight: '800' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.6,
      marginTop: 8,
      marginBottom: 6,
    },
    chip: {
      minWidth: 40,
      height: 36,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      paddingHorizontal: 8,
    },
    chipOn: { backgroundColor: c.chrome, borderColor: c.chrome },
    chipText: { color: c.text, fontWeight: '700' as const },
    chipTextOn: { color: c.chromeInk },
    stepBtn: {
      width: 40,
      height: 40,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    stepText: { color: c.link, fontSize: 22, fontWeight: '800' as const, lineHeight: 24 },
    killValue: {
      color: c.text,
      fontSize: 20,
      fontWeight: '800' as const,
      minWidth: 32,
      textAlign: 'center' as const,
    },
    breakdown: { color: c.textMuted, fontSize: 12 },
    addBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      gap: 8,
      paddingVertical: 12,
      borderRadius: 12,
      borderWidth: 1,
      borderStyle: 'dashed' as const,
      borderColor: c.border,
      marginBottom: 10,
    },
    addText: { color: c.link, fontWeight: '700' as const },
    section: {
      marginBottom: 18,
      paddingBottom: 6,
    },
    sectionTitle: {
      color: c.chrome,
      fontSize: 13,
      fontWeight: '800' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.8,
      flex: 1,
    },
    totalBox: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 10,
      padding: 12,
      borderRadius: 14,
      backgroundColor: c.surface,
      borderWidth: 1,
      borderColor: c.chrome,
    },
    newTableBtn: {
      borderStyle: 'solid' as const,
      backgroundColor: c.chrome,
      borderColor: c.chrome,
      marginBottom: 24,
    },
    newTableText: { color: c.chromeInk, fontWeight: '800' as const },
    totalLabel: {
      color: c.textDim,
      fontSize: 11,
      fontWeight: '800' as const,
      textTransform: 'uppercase' as const,
      letterSpacing: 0.6,
    },
    totalValue: { color: c.chrome, fontSize: 32, fontWeight: '900' as const, lineHeight: 36 },
    totalSub: { color: c.textMuted, fontSize: 12 },
    ghostBtn: {
      paddingHorizontal: 14,
      height: 44,
      borderRadius: 12,
      borderWidth: 1,
      borderColor: c.border,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
    },
    ghostText: { color: c.text, fontWeight: '700' as const },
    sendBtn: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 16,
      height: 44,
      borderRadius: 12,
      backgroundColor: c.chrome,
    },
    sendText: { color: c.chromeInk, fontWeight: '800' as const },
  };
}

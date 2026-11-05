import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  LayoutChangeEvent,
  Modal,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as mapsApi from '../api/maps';
import { FreeFireMap, MapPin, mapPins } from '../api/maps';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { SoftPressable } from '../ui/SoftPressable';
import { sharedStyles } from './shared';
import { colors } from '../theme';

type Props = NativeStackScreenProps<MainStackParamList, 'Maps'>;

type ViewerTarget =
  | { kind: 'overview'; map: FreeFireMap }
  | { kind: 'poi'; map: FreeFireMap; pin: MapPin };

type PinFilter = 'all' | 'drop' | 'vending_machine';

const PIN_FILTERS: { key: PinFilter; label: string }[] = [
  { key: 'all', label: 'All' },
  { key: 'drop', label: 'Drops' },
  { key: 'vending_machine', label: 'Vending' },
];

const PIN_SIZE = 30;

function pinLabel(pin: MapPin): string {
  if (pin.category === 'drop') {
    return pin.tier === 'primary' ? 'Primary drop' : 'Secondary drop';
  }
  return 'Vending machine';
}

function pinIcon(pin: MapPin): keyof typeof Ionicons.glyphMap {
  return pin.category === 'drop' ? 'flag' : 'cart';
}

export function MapsScreen(_props: Props) {
  const [maps, setMaps] = useState<FreeFireMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [pinFilter, setPinFilter] = useState<PinFilter>('all');
  const [overviewBoxSize, setOverviewBoxSize] = useState(0);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await mapsApi.listMaps();
      setMaps(next);
    } catch {
      setError('Could not load maps');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const openViewer = useCallback((target: ViewerTarget) => {
    setPinFilter('all');
    setViewer(target);
  }, []);

  const pins = useMemo(
    () => (viewer ? mapPins(viewer.map) : []),
    [viewer],
  );

  const visiblePins = useMemo(
    () =>
      pinFilter === 'all'
        ? pins
        : pins.filter((pin) => pin.category === pinFilter),
    [pins, pinFilter],
  );

  const onOverviewLayout = useCallback((e: LayoutChangeEvent) => {
    const { width, height } = e.nativeEvent.layout;
    setOverviewBoxSize(Math.min(width, height));
  }, []);

  const viewerTitle =
    viewer?.kind === 'poi'
      ? `${viewer.pin.name} · ${viewer.map.name}`
      : viewer
        ? `${viewer.map.name} overview`
        : '';

  const viewerSrc =
    viewer?.kind === 'poi' ? viewer.pin.imageUrl : viewer?.map.imageUrl ?? '';

  if (loading) {
    return (
      <Screen>
        <View style={styles.center}>
          <ActivityIndicator color={colors.chrome} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        style={styles.list}
        data={maps}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.content}
        ListHeaderComponent={
          <>
            <Text style={sharedStyles.title}>Maps</Text>
            <Text style={styles.hint}>
              Team drop points — primary & secondary per map.
            </Text>
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        }
        renderItem={({ item: map, index }) => (
          <View style={styles.block}>
            <View style={styles.blockHead}>
              <Text style={styles.sno}>{index + 1}</Text>
              <View style={styles.blockText}>
                <Text style={styles.mapName}>{map.name}</Text>
                <Text style={styles.mapMeta}>
                  {map.theme}
                  {map.size ? ` · ${map.size}` : ''}
                </Text>
              </View>
            </View>

            <SoftPressable
              style={styles.overviewBtn}
              onPress={() => openViewer({ kind: 'overview', map })}
              accessibilityLabel={`Open ${map.name} interactive map`}
              pressScale={0.99}
            >
              <Image
                source={{ uri: map.imageUrl }}
                style={styles.overviewImage}
                resizeMode="cover"
              />
            </SoftPressable>

            <Text style={styles.dropEyebrow}>Sacred drops</Text>
            <View style={styles.dropRow}>
              {[map.primary, map.secondary].map((drop) => (
                <SoftPressable
                  key={drop.id}
                  style={styles.dropCard}
                  onPress={() =>
                    openViewer({
                      kind: 'poi',
                      map,
                      pin: { ...drop, category: 'drop' },
                    })
                  }
                  accessibilityLabel={`Open ${drop.name}`}
                  pressScale={0.98}
                >
                  <Text
                    style={[
                      styles.tierBadge,
                      drop.tier === 'primary'
                        ? styles.tierPrimary
                        : styles.tierSecondary,
                    ]}
                  >
                    {drop.tier === 'primary' ? 'Primary' : 'Secondary'}
                  </Text>
                  <Image
                    source={{ uri: drop.imageUrl }}
                    style={styles.dropImage}
                    resizeMode="cover"
                  />
                  <Text style={styles.dropName}>{drop.name}</Text>
                  <Text style={styles.dropNote}>{drop.note}</Text>
                </SoftPressable>
              ))}
            </View>
          </View>
        )}
        ListEmptyComponent={
          !error ? (
            <Text style={styles.empty}>No maps in the catalog yet.</Text>
          ) : null
        }
      />

      <Modal
        visible={!!viewer}
        animationType="fade"
        presentationStyle="fullScreen"
        onRequestClose={() => setViewer(null)}
      >
        <View style={styles.modalRoot}>
          <View style={styles.modalBar}>
            <View style={styles.modalTitleCol}>
              <Text style={styles.modalTitle} numberOfLines={1}>
                {viewerTitle}
              </Text>
              <Text style={styles.modalNote}>
                {viewer?.kind === 'poi'
                  ? pinLabel(viewer.pin)
                  : 'Tap a pin to open that location'}
              </Text>
            </View>
            <SoftPressable
              style={styles.closeBtn}
              onPress={() => setViewer(null)}
              accessibilityLabel="Close"
              pressScale={0.96}
            >
              <Ionicons name="close" size={22} color={colors.text} />
            </SoftPressable>
          </View>

          {viewer ? (
            <View style={styles.modalBody}>
              <View style={styles.rail}>
                <SoftPressable
                  style={[
                    styles.railItem,
                    viewer.kind === 'overview' && styles.railItemActive,
                  ]}
                  onPress={() =>
                    openViewer({ kind: 'overview', map: viewer.map })
                  }
                  pressScale={0.97}
                >
                  <Text
                    style={[
                      styles.railLabel,
                      viewer.kind === 'overview' && styles.railItemActiveLabel,
                    ]}
                  >
                    Overview
                  </Text>
                </SoftPressable>
                {[viewer.map.primary, viewer.map.secondary].map((drop) => {
                  const active =
                    viewer.kind === 'poi' && viewer.pin.id === drop.id;
                  return (
                    <SoftPressable
                      key={drop.id}
                      style={[styles.railItem, active && styles.railItemActive]}
                      onPress={() =>
                        openViewer({
                          kind: 'poi',
                          map: viewer.map,
                          pin: { ...drop, category: 'drop' },
                        })
                      }
                      pressScale={0.97}
                    >
                      <Text
                        style={[
                          styles.railLabel,
                          active && styles.railItemActiveLabel,
                        ]}
                      >
                        {drop.name}
                      </Text>
                    </SoftPressable>
                  );
                })}
              </View>

              {viewer.kind === 'overview' ? (
                <View style={styles.filterRow}>
                  {PIN_FILTERS.map((filter) => {
                    const active = pinFilter === filter.key;
                    return (
                      <SoftPressable
                        key={filter.key}
                        style={[
                          styles.filterChip,
                          active && styles.filterChipActive,
                        ]}
                        onPress={() => setPinFilter(filter.key)}
                        pressScale={0.96}
                      >
                        <Text
                          style={[
                            styles.filterLabel,
                            active && styles.filterLabelActive,
                          ]}
                        >
                          {filter.label}
                        </Text>
                      </SoftPressable>
                    );
                  })}
                </View>
              ) : null}

              <View style={styles.imageWrap}>
                {viewer.kind === 'overview' ? (
                  <View
                    style={styles.overviewBox}
                    onLayout={onOverviewLayout}
                  >
                    {overviewBoxSize > 0 ? (
                      <View
                        style={{
                          width: overviewBoxSize,
                          height: overviewBoxSize,
                        }}
                      >
                        <Image
                          source={{ uri: viewer.map.imageUrl }}
                          style={styles.viewerImage}
                          resizeMode="cover"
                          accessibilityLabel={viewerTitle}
                        />
                        {visiblePins.map((pin) => (
                          <SoftPressable
                            key={pin.id}
                            style={[
                              styles.pin,
                              pin.category === 'vending_machine' &&
                                styles.pinVending,
                              pin.category === 'drop' &&
                                pin.tier === 'secondary' &&
                                styles.pinSecondary,
                              {
                                left: pin.x * overviewBoxSize - PIN_SIZE / 2,
                                top: pin.y * overviewBoxSize - PIN_SIZE / 2,
                              },
                            ]}
                            onPress={() =>
                              openViewer({ kind: 'poi', map: viewer.map, pin })
                            }
                            accessibilityLabel={`Open ${pin.name}`}
                            pressScale={0.9}
                          >
                            <Ionicons
                              name={pinIcon(pin)}
                              size={14}
                              color={colors.chromeInk}
                            />
                          </SoftPressable>
                        ))}
                      </View>
                    ) : null}
                  </View>
                ) : (
                  <Image
                    source={{ uri: viewerSrc }}
                    style={[styles.viewerImage, styles.viewerImageWide]}
                    resizeMode="contain"
                    accessibilityLabel={viewerTitle}
                  />
                )}
              </View>
            </View>
          ) : null}
        </View>
      </Modal>
    </Screen>
  );
}

const styles = StyleSheet.create({
  list: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  hint: {
    color: colors.textMuted,
    fontSize: 13,
    lineHeight: 18,
    marginTop: -8,
    marginBottom: 16,
  },
  error: { color: colors.danger, marginBottom: 12 },
  empty: { color: colors.textMuted, textAlign: 'center', marginTop: 24 },
  block: {
    marginBottom: 22,
    padding: 14,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(255,255,255,0.035)',
  },
  blockHead: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 12,
  },
  sno: {
    width: 28,
    height: 28,
    borderRadius: 8,
    textAlign: 'center',
    overflow: 'hidden',
    color: colors.chromeInk,
    backgroundColor: colors.chrome,
    fontWeight: '800',
    lineHeight: 28,
  },
  blockText: { flex: 1 },
  mapName: { color: colors.text, fontWeight: '800', fontSize: 17 },
  mapMeta: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  overviewBtn: { borderRadius: 12, overflow: 'hidden', marginBottom: 14 },
  overviewImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#0a0a0c',
  },
  dropEyebrow: {
    color: colors.textDim,
    fontSize: 11,
    fontWeight: '700',
    letterSpacing: 1,
    textTransform: 'uppercase',
    marginBottom: 8,
  },
  dropRow: { flexDirection: 'row', gap: 10 },
  dropCard: {
    flex: 1,
    borderRadius: 12,
    padding: 8,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    backgroundColor: 'rgba(0,0,0,0.25)',
  },
  tierBadge: {
    alignSelf: 'flex-start',
    fontSize: 10,
    fontWeight: '800',
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 999,
    overflow: 'hidden',
    marginBottom: 6,
  },
  tierPrimary: { backgroundColor: colors.chrome, color: colors.chromeInk },
  tierSecondary: {
    backgroundColor: 'rgba(255,255,255,0.12)',
    color: colors.text,
  },
  dropImage: {
    width: '100%',
    aspectRatio: 2,
    borderRadius: 8,
    backgroundColor: '#0a0a0c',
  },
  dropName: {
    color: colors.text,
    fontWeight: '700',
    fontSize: 13,
    marginTop: 8,
  },
  dropNote: { color: colors.textMuted, fontSize: 11, marginTop: 2 },
  modalRoot: { flex: 1, backgroundColor: '#050507' },
  modalBar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    paddingHorizontal: 14,
    paddingTop: 54,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
  },
  modalTitleCol: { flex: 1 },
  modalTitle: { color: colors.text, fontWeight: '800', fontSize: 17 },
  modalNote: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  closeBtn: {
    width: 36,
    height: 36,
    alignItems: 'center',
    justifyContent: 'center',
  },
  modalBody: { flex: 1 },
  rail: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  railItem: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: 'rgba(255,255,255,0.06)',
  },
  railItemActive: { backgroundColor: colors.chrome },
  railLabel: { color: colors.text, fontWeight: '700', fontSize: 12 },
  railItemActiveLabel: { color: colors.chromeInk },
  filterRow: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 10,
  },
  filterChip: {
    paddingHorizontal: 14,
    paddingVertical: 7,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.12)',
    backgroundColor: 'rgba(0,0,0,0.3)',
  },
  filterChipActive: {
    backgroundColor: colors.chrome,
    borderColor: colors.chrome,
  },
  filterLabel: { color: colors.textMuted, fontWeight: '700', fontSize: 12 },
  filterLabelActive: { color: colors.chromeInk },
  imageWrap: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
  },
  overviewBox: { flex: 1, width: '100%', alignItems: 'center', justifyContent: 'center' },
  viewerImage: {
    width: '100%',
    height: '100%',
  },
  viewerImageWide: {
    maxHeight: '70%',
  },
  pin: {
    position: 'absolute',
    width: PIN_SIZE,
    height: PIN_SIZE,
    borderRadius: PIN_SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chrome,
    borderWidth: 2,
    borderColor: '#050507',
  },
  pinSecondary: { backgroundColor: 'rgba(255,255,255,0.85)' },
  pinVending: { backgroundColor: '#3ddc84' },
});

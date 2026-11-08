import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  LayoutChangeEvent,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as mapsApi from '../api/maps';
import {
  DropTier,
  FreeFireMap,
  MapImageSlot,
  MapPin,
  mapPins,
} from '../api/maps';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { SoftPressable } from '../ui/SoftPressable';
import { emitToast } from '../ui/toastBus';
import { apiErrorMessage } from '../api/apiErrorMessage';
import { colors } from '../theme';

type PickedFile = { uri: string; fileName: string; mimeType: string };

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
  const insets = useSafeAreaInsets();
  const [maps, setMaps] = useState<FreeFireMap[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [viewer, setViewer] = useState<ViewerTarget | null>(null);
  const [pinFilter, setPinFilter] = useState<PinFilter>('all');
  const [overviewBoxSize, setOverviewBoxSize] = useState(0);
  const [uploadingSlot, setUploadingSlot] = useState<string | null>(null);
  const [addMapOpen, setAddMapOpen] = useState(false);
  const [addDropFor, setAddDropFor] = useState<FreeFireMap | null>(null);
  const [mapName, setMapName] = useState('');
  const [mapTheme, setMapTheme] = useState('');
  const [mapFile, setMapFile] = useState<PickedFile | null>(null);
  const [dropName, setDropName] = useState('');
  const [dropNote, setDropNote] = useState('');
  const [dropTier, setDropTier] = useState<DropTier>('extra');
  const [dropFile, setDropFile] = useState<PickedFile | null>(null);
  const [savingForm, setSavingForm] = useState(false);

  const canManage = maps.some((m) => m.canUpload);

  const load = useCallback(async () => {
    setError(null);
    try {
      const next = await mapsApi.listMaps();
      setMaps(next);
      setViewer((prev) => {
        if (!prev) return prev;
        const fresh = next.find((m) => m.id === prev.map.id);
        if (!fresh) return prev;
        if (prev.kind === 'overview') return { kind: 'overview', map: fresh };
        if (prev.pin.category === 'vending_machine') {
          const machine =
            fresh.vendingMachines.find((v) => v.id === prev.pin.id) ?? prev.pin;
          return {
            kind: 'poi',
            map: fresh,
            pin: { ...machine, category: 'vending_machine' },
          };
        }
        const dropList = fresh.drops?.length
          ? fresh.drops
          : [fresh.primary, fresh.secondary];
        const drop =
          dropList.find((d) => d.id === prev.pin.id) ??
          dropList.find((d) => d.tier === prev.pin.tier) ??
          fresh.primary;
        return {
          kind: 'poi',
          map: fresh,
          pin: { ...drop, category: 'drop' },
        };
      });
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

  const pickImage = useCallback(async (): Promise<PickedFile | null> => {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        'Permission needed',
        'Allow gallery access to upload a map image.',
      );
      return null;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      quality: 0.9,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets[0]) return null;
    const asset = result.assets[0];
    return {
      uri: asset.uri,
      fileName: asset.fileName ?? `map-${Date.now()}.jpg`,
      mimeType: asset.mimeType ?? 'image/jpeg',
    };
  }, []);

  const uploadSlot = useCallback(
    async (mapId: string, slot: MapImageSlot, label: string) => {
      const file = await pickImage();
      if (!file) return;
      const key = `${mapId}:${slot}`;
      setUploadingSlot(key);
      try {
        await mapsApi.uploadMapImage(mapId, slot, file);
        emitToast(`${label} updated`);
        await load();
      } catch (err) {
        emitToast(apiErrorMessage(err, 'Could not upload map image'));
      } finally {
        setUploadingSlot(null);
      }
    },
    [load, pickImage],
  );

  const submitNewMap = useCallback(async () => {
    if (!mapName.trim() || !mapFile) {
      emitToast('Name and overview photo are required');
      return;
    }
    setSavingForm(true);
    try {
      await mapsApi.createMap({
        name: mapName.trim(),
        theme: mapTheme.trim() || undefined,
        file: mapFile,
      });
      emitToast('Map added');
      setAddMapOpen(false);
      setMapName('');
      setMapTheme('');
      setMapFile(null);
      await load();
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not create map'));
    } finally {
      setSavingForm(false);
    }
  }, [load, mapFile, mapName, mapTheme]);

  const submitNewDrop = useCallback(async () => {
    if (!addDropFor || !dropName.trim()) {
      emitToast('Drop name is required');
      return;
    }
    setSavingForm(true);
    try {
      await mapsApi.addDropPoint(addDropFor.id, {
        name: dropName.trim(),
        tier: dropTier,
        note: dropNote.trim() || undefined,
        file: dropFile ?? undefined,
      });
      emitToast('Drop point added');
      setAddDropFor(null);
      setDropName('');
      setDropNote('');
      setDropTier('extra');
      setDropFile(null);
      await load();
    } catch (err) {
      emitToast(apiErrorMessage(err, 'Could not add drop point'));
    } finally {
      setSavingForm(false);
    }
  }, [addDropFor, dropFile, dropName, dropNote, dropTier, load]);

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
            <Text style={styles.hint}>
              Team drop points — primary & secondary per map.
              {canManage
                ? ' Owner, coach, and analyst can add maps and drop points (cloud).'
                : ''}
            </Text>
            {canManage ? (
              <SoftPressable
                style={styles.uploadChip}
                onPress={() => setAddMapOpen(true)}
                accessibilityRole="button"
                accessibilityLabel="Add new map"
                pressScale={0.96}
              >
                <Ionicons name="add-circle-outline" size={16} color={colors.chromeInk} />
                <Text style={styles.uploadChipText}>Add map</Text>
              </SoftPressable>
            ) : null}
            {error ? <Text style={styles.error}>{error}</Text> : null}
          </>
        }
        renderItem={({ item: map, index }) => {
          const dropList = map.drops?.length
            ? map.drops
            : [map.primary, map.secondary];
          return (
            <View style={styles.block}>
              <View style={styles.blockHead}>
                <Text style={styles.sno}>{index + 1}</Text>
                <View style={styles.blockText}>
                  <Text style={styles.mapName}>{map.name}</Text>
                  <Text style={styles.mapMeta}>
                    {map.isCustom ? 'Custom · ' : ''}
                    {map.theme}
                    {map.size ? ` · ${map.size}` : ''}
                  </Text>
                </View>
              </View>

              <View style={styles.overviewWrap}>
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
                {map.canUpload ? (
                  <View style={styles.actionRow}>
                    <SoftPressable
                      style={styles.uploadChip}
                      disabled={uploadingSlot === `${map.id}:overview`}
                      onPress={() =>
                        void uploadSlot(
                          map.id,
                          'overview',
                          `${map.name} overview`,
                        )
                      }
                      accessibilityRole="button"
                      accessibilityLabel={`Replace ${map.name} overview`}
                      pressScale={0.96}
                    >
                      {uploadingSlot === `${map.id}:overview` ? (
                        <ActivityIndicator
                          color={colors.chromeInk}
                          size="small"
                        />
                      ) : (
                        <>
                          <Ionicons
                            name="cloud-upload-outline"
                            size={16}
                            color={colors.chromeInk}
                          />
                          <Text style={styles.uploadChipText}>
                            Replace map photo
                          </Text>
                        </>
                      )}
                    </SoftPressable>
                    <SoftPressable
                      style={styles.secondaryChip}
                      onPress={() => {
                        setDropName('');
                        setDropNote('');
                        setDropTier('extra');
                        setDropFile(null);
                        setAddDropFor(map);
                      }}
                      accessibilityRole="button"
                      accessibilityLabel={`Add drop point on ${map.name}`}
                      pressScale={0.96}
                    >
                      <Ionicons name="flag-outline" size={16} color={colors.link} />
                      <Text style={styles.secondaryChipText}>Add drop</Text>
                    </SoftPressable>
                  </View>
                ) : null}
              </View>

              <Text style={styles.dropEyebrow}>Drop points</Text>
              <View style={styles.dropRow}>
                {dropList.map((drop) => {
                  const canReplaceSlot =
                    map.canUpload &&
                    !map.isCustom &&
                    !drop.isCustomDrop &&
                    (drop.tier === 'primary' || drop.tier === 'secondary');
                  const busy = uploadingSlot === `${map.id}:${drop.tier}`;
                  return (
                    <View key={drop.id} style={styles.dropCard}>
                      <SoftPressable
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
                              : drop.tier === 'secondary'
                                ? styles.tierSecondary
                                : styles.tierExtra,
                          ]}
                        >
                          {drop.tier === 'primary'
                            ? 'Primary'
                            : drop.tier === 'secondary'
                              ? 'Secondary'
                              : 'Drop'}
                        </Text>
                        <Image
                          source={{ uri: drop.imageUrl }}
                          style={styles.dropImage}
                          resizeMode="cover"
                        />
                        <Text style={styles.dropName}>{drop.name}</Text>
                        <Text style={styles.dropNote}>{drop.note}</Text>
                      </SoftPressable>
                      {canReplaceSlot ? (
                        <SoftPressable
                          style={styles.uploadChipCompact}
                          disabled={busy}
                          onPress={() =>
                            void uploadSlot(map.id, drop.tier, drop.name)
                          }
                          accessibilityRole="button"
                          accessibilityLabel={`Upload ${drop.name} photo`}
                          pressScale={0.96}
                        >
                          {busy ? (
                            <ActivityIndicator
                              color={colors.link}
                              size="small"
                            />
                          ) : (
                            <>
                              <Ionicons
                                name="cloud-upload-outline"
                                size={14}
                                color={colors.link}
                              />
                              <Text style={styles.uploadChipCompactText}>
                                Replace photo
                              </Text>
                            </>
                          )}
                        </SoftPressable>
                      ) : null}
                    </View>
                  );
                })}
              </View>
            </View>
          );
        }}
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
          <View style={[styles.modalBar, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
            <Pressable
              style={styles.navBtn}
              onPress={() => setViewer(null)}
              accessibilityLabel="Back"
              hitSlop={10}
            >
              <Ionicons name="chevron-back" size={26} color={colors.text} />
            </Pressable>
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
            <Pressable
              style={styles.closeBtn}
              onPress={() => setViewer(null)}
              accessibilityLabel="Close"
              hitSlop={10}
            >
              <Ionicons name="close" size={26} color={colors.chromeInk} />
            </Pressable>
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

      <Modal
        visible={addMapOpen}
        transparent
        animationType="fade"
        onRequestClose={() => setAddMapOpen(false)}
      >
        <Pressable style={styles.formBackdrop} onPress={() => setAddMapOpen(false)}>
          <Pressable style={styles.formSheet} onPress={() => undefined}>
            <Text style={styles.formTitle}>Add map</Text>
            <TextInput
              style={styles.formInput}
              placeholder="Map name"
              placeholderTextColor={colors.textDim}
              value={mapName}
              onChangeText={setMapName}
            />
            <TextInput
              style={styles.formInput}
              placeholder="Theme / note (optional)"
              placeholderTextColor={colors.textDim}
              value={mapTheme}
              onChangeText={setMapTheme}
            />
            <SoftPressable
              style={styles.secondaryChip}
              onPress={() => void pickImage().then((f) => f && setMapFile(f))}
              pressScale={0.96}
            >
              <Ionicons name="image-outline" size={16} color={colors.link} />
              <Text style={styles.secondaryChipText}>
                {mapFile ? 'Overview photo selected' : 'Pick overview photo'}
              </Text>
            </SoftPressable>
            <SoftPressable
              style={[styles.uploadChip, styles.formSubmit]}
              disabled={savingForm}
              onPress={() => void submitNewMap()}
              pressScale={0.96}
            >
              {savingForm ? (
                <ActivityIndicator color={colors.chromeInk} size="small" />
              ) : (
                <Text style={styles.uploadChipText}>Create map</Text>
              )}
            </SoftPressable>
          </Pressable>
        </Pressable>
      </Modal>

      <Modal
        visible={!!addDropFor}
        transparent
        animationType="fade"
        onRequestClose={() => setAddDropFor(null)}
      >
        <Pressable style={styles.formBackdrop} onPress={() => setAddDropFor(null)}>
          <Pressable style={styles.formSheet} onPress={() => undefined}>
            <Text style={styles.formTitle}>
              Add drop · {addDropFor?.name ?? ''}
            </Text>
            <TextInput
              style={styles.formInput}
              placeholder="Drop point name"
              placeholderTextColor={colors.textDim}
              value={dropName}
              onChangeText={setDropName}
            />
            <TextInput
              style={styles.formInput}
              placeholder="Note (optional)"
              placeholderTextColor={colors.textDim}
              value={dropNote}
              onChangeText={setDropNote}
            />
            <View style={styles.tierPickRow}>
              {(['primary', 'secondary', 'extra'] as DropTier[]).map((tier) => {
                const active = dropTier === tier;
                return (
                  <SoftPressable
                    key={tier}
                    style={[styles.tierPick, active && styles.tierPickActive]}
                    onPress={() => setDropTier(tier)}
                    pressScale={0.96}
                  >
                    <Text
                      style={[
                        styles.tierPickText,
                        active && styles.tierPickTextActive,
                      ]}
                    >
                      {tier === 'extra' ? 'Extra' : tier}
                    </Text>
                  </SoftPressable>
                );
              })}
            </View>
            <SoftPressable
              style={styles.secondaryChip}
              onPress={() => void pickImage().then((f) => f && setDropFile(f))}
              pressScale={0.96}
            >
              <Ionicons name="image-outline" size={16} color={colors.link} />
              <Text style={styles.secondaryChipText}>
                {dropFile ? 'Drop photo selected' : 'Pick drop photo (optional)'}
              </Text>
            </SoftPressable>
            <SoftPressable
              style={[styles.uploadChip, styles.formSubmit]}
              disabled={savingForm}
              onPress={() => void submitNewDrop()}
              pressScale={0.96}
            >
              {savingForm ? (
                <ActivityIndicator color={colors.chromeInk} size="small" />
              ) : (
                <Text style={styles.uploadChipText}>Add drop point</Text>
              )}
            </SoftPressable>
          </Pressable>
        </Pressable>
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
  overviewWrap: { marginBottom: 14, gap: 8 },
  overviewBtn: { borderRadius: 12, overflow: 'hidden' },
  overviewImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#0a0a0c',
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  uploadChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    backgroundColor: colors.chrome,
    marginBottom: 12,
  },
  uploadChipText: {
    color: colors.chromeInk,
    fontWeight: '700',
    fontSize: 13,
  },
  secondaryChip: {
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
  },
  secondaryChipText: {
    color: colors.link,
    fontWeight: '700',
    fontSize: 13,
  },
  uploadChipCompact: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  uploadChipCompactText: {
    color: colors.link,
    fontWeight: '700',
    fontSize: 12,
  },
  formBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  formSheet: {
    borderRadius: 16,
    padding: 16,
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.border,
    gap: 10,
  },
  formTitle: {
    color: colors.text,
    fontWeight: '800',
    fontSize: 18,
    marginBottom: 4,
  },
  formInput: {
    borderWidth: 1,
    borderColor: colors.border,
    backgroundColor: colors.surface,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.text,
    fontSize: 15,
  },
  formSubmit: { marginBottom: 0, alignSelf: 'stretch', justifyContent: 'center' },
  tierPickRow: { flexDirection: 'row', gap: 8 },
  tierPick: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: 10,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: colors.border,
  },
  tierPickActive: {
    backgroundColor: colors.chrome,
    borderColor: colors.chrome,
  },
  tierPickText: {
    color: colors.textMuted,
    fontWeight: '700',
    fontSize: 12,
    textTransform: 'capitalize',
  },
  tierPickTextActive: { color: colors.chromeInk },
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
  tierExtra: {
    backgroundColor: 'rgba(168,176,255,0.2)',
    color: colors.link,
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
    gap: 8,
    paddingHorizontal: 12,
    paddingBottom: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.border,
    zIndex: 5,
  },
  modalTitleCol: { flex: 1, minWidth: 0 },
  modalTitle: { color: colors.text, fontWeight: '800', fontSize: 17 },
  modalNote: { color: colors.textMuted, fontSize: 12, marginTop: 2 },
  navBtn: {
    width: 42,
    height: 42,
    alignItems: 'center',
    justifyContent: 'center',
  },
  closeBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.chrome,
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

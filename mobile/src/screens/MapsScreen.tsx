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
import { AppIcon, AppIconName } from '../ui/AppIcon';
import * as ImagePicker from 'expo-image-picker';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { NativeStackScreenProps } from '@react-navigation/native-stack';
import * as mapsApi from '../api/maps';
import {
  DropTier,
  FreeFireMap,
  MapDrop,
  MapImageSlot,
  MapPin,
  mapPins,
} from '../api/maps';
import { MainStackParamList } from '../navigation/types';
import { Screen } from '../brand/Screen';
import { SoftPressable } from '../ui/SoftPressable';
import { emitToast } from '../ui/toastBus';
import { apiErrorMessage } from '../api/apiErrorMessage';
import { ThemeColors } from '../theme';
import { useTheme } from '../theme/ThemeContext';
import { useThemedStyles } from '../theme/useThemedStyles';

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

function pinIcon(pin: MapPin): AppIconName {
  return pin.category === 'drop' ? 'flag' : 'cart';
}

export function MapsScreen(_props: Props) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(mapsStyles);
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
        // prev.pin is narrowed to MapDrop here (vending_machine was handled
        // above with an early return) but TypeScript loses that narrowing
        // inside the setState callback, so we assert the type explicitly.
        const prevDrop = prev.pin as { category: 'drop' } & MapDrop;
        const drop =
          dropList.find((d) => d.id === prevDrop.id) ??
          dropList.find((d) => d.tier === prevDrop.tier) ??
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
        <View style={staticStyles.center}>
          <ActivityIndicator color={colors.chrome} />
        </View>
      </Screen>
    );
  }

  return (
    <Screen>
      <FlatList
        style={staticStyles.list}
        data={maps}
        keyExtractor={(item) => item.id}
        contentContainerStyle={staticStyles.content}
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
                <AppIcon name="add-circle-outline" size={16} color={colors.chromeInk} />
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
            <View style={staticStyles.block}>
              <View style={staticStyles.blockHead}>
                <Text style={styles.sno}>{index + 1}</Text>
                <View style={staticStyles.blockText}>
                  <Text style={styles.mapName}>{map.name}</Text>
                  <Text style={styles.mapMeta}>
                    {map.isCustom ? 'Custom · ' : ''}
                    {map.theme}
                    {map.size ? ` · ${map.size}` : ''}
                  </Text>
                </View>
              </View>

              <View style={staticStyles.overviewWrap}>
                <SoftPressable
                  style={staticStyles.overviewBtn}
                  onPress={() => openViewer({ kind: 'overview', map })}
                  accessibilityLabel={`Open ${map.name} interactive map`}
                  pressScale={0.99}
                >
                  <Image
                    source={{ uri: map.imageUrl }}
                    style={staticStyles.overviewImage}
                    resizeMode="cover"
                  />
                </SoftPressable>
                {map.canUpload ? (
                  <View style={staticStyles.actionRow}>
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
                          <AppIcon
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
                      <AppIcon name="flag-outline" size={16} color={colors.link} />
                      <Text style={styles.secondaryChipText}>Add drop</Text>
                    </SoftPressable>
                  </View>
                ) : null}
              </View>

              <Text style={styles.dropEyebrow}>Drop points</Text>
              <View style={staticStyles.dropRow}>
                {dropList.map((drop) => {
                  const canReplaceSlot =
                    map.canUpload &&
                    !map.isCustom &&
                    !drop.isCustomDrop &&
                    (drop.tier === 'primary' || drop.tier === 'secondary');
                  const busy = uploadingSlot === `${map.id}:${drop.tier}`;
                  return (
                    <View key={drop.id} style={staticStyles.dropCard}>
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
                            staticStyles.tierBadge,
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
                          style={staticStyles.dropImage}
                          resizeMode="cover"
                        />
                        <Text style={styles.dropName}>{drop.name}</Text>
                        <Text style={styles.dropNote}>{drop.note}</Text>
                      </SoftPressable>
                      {canReplaceSlot ? (
                        <SoftPressable
                          style={staticStyles.uploadChipCompact}
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
                              <AppIcon
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
        <View style={staticStyles.modalRoot}>
          <View style={[styles.modalBar, { paddingTop: Math.max(insets.top, 12) + 8 }]}>
            <Pressable
              style={staticStyles.navBtn}
              onPress={() => setViewer(null)}
              accessibilityLabel="Back"
              hitSlop={10}
            >
              <AppIcon name="chevron-back" size={26} color={colors.text} />
            </Pressable>
            <View style={staticStyles.modalTitleCol}>
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
              <AppIcon name="close" size={26} color={colors.chromeInk} />
            </Pressable>
          </View>

          {viewer ? (
            <View style={staticStyles.modalBody}>
              <View style={staticStyles.rail}>
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
                <View style={staticStyles.filterRow}>
                  {PIN_FILTERS.map((filter) => {
                    const active = pinFilter === filter.key;
                    return (
                      <SoftPressable
                        key={filter.key}
                        style={[
                          staticStyles.filterChip,
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

              <View style={staticStyles.imageWrap}>
                {viewer.kind === 'overview' ? (
                  <View
                    style={staticStyles.overviewBox}
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
                          style={staticStyles.viewerImage}
                          resizeMode="cover"
                          accessibilityLabel={viewerTitle}
                        />
                        {visiblePins.map((pin) => (
                          <SoftPressable
                            key={pin.id}
                            style={[
                              styles.pin,
                              pin.category === 'vending_machine' &&
                                staticStyles.pinVending,
                              pin.category === 'drop' &&
                                pin.tier === 'secondary' &&
                                staticStyles.pinSecondary,
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
                            <AppIcon
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
                    style={[staticStyles.viewerImage, staticStyles.viewerImageWide]}
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
        <Pressable style={staticStyles.formBackdrop} onPress={() => setAddMapOpen(false)}>
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
              <AppIcon name="image-outline" size={16} color={colors.link} />
              <Text style={styles.secondaryChipText}>
                {mapFile ? 'Overview photo selected' : 'Pick overview photo'}
              </Text>
            </SoftPressable>
            <SoftPressable
              style={[styles.uploadChip, staticStyles.formSubmit]}
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
        <Pressable style={staticStyles.formBackdrop} onPress={() => setAddDropFor(null)}>
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
            <View style={staticStyles.tierPickRow}>
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
              <AppIcon name="image-outline" size={16} color={colors.link} />
              <Text style={styles.secondaryChipText}>
                {dropFile ? 'Drop photo selected' : 'Pick drop photo (optional)'}
              </Text>
            </SoftPressable>
            <SoftPressable
              style={[styles.uploadChip, staticStyles.formSubmit]}
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

/** Layout-only — identical across every theme, safe as a static StyleSheet. */
const staticStyles = StyleSheet.create({
  list: { flex: 1 },
  content: { padding: 20, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
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
  blockText: { flex: 1 },
  overviewWrap: { marginBottom: 14, gap: 8 },
  overviewBtn: { borderRadius: 12, overflow: 'hidden' },
  overviewImage: {
    width: '100%',
    aspectRatio: 1,
    backgroundColor: '#0a0a0c',
  },
  actionRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  uploadChipCompact: {
    marginTop: 8,
    alignSelf: 'flex-start',
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  formBackdrop: {
    flex: 1,
    backgroundColor: 'rgba(0,0,0,0.65)',
    justifyContent: 'center',
    padding: 20,
  },
  formSubmit: { marginBottom: 0, alignSelf: 'stretch', justifyContent: 'center' },
  tierPickRow: { flexDirection: 'row', gap: 8 },
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
  dropImage: {
    width: '100%',
    aspectRatio: 2,
    borderRadius: 8,
    backgroundColor: '#0a0a0c',
  },
  modalRoot: { flex: 1, backgroundColor: '#050507' },
  modalTitleCol: { flex: 1, minWidth: 0 },
  navBtn: {
    width: 42,
    height: 42,
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
  pinSecondary: { backgroundColor: 'rgba(255,255,255,0.85)' },
  pinVending: { backgroundColor: '#3ddc84' },
});

/** Theme-dependent — rebuilt live by useThemedStyles() on every theme change. */
function mapsStyles(c: ThemeColors) {
  return {
    hint: {
      color: c.textMuted,
      fontSize: 13,
      lineHeight: 18,
      marginTop: -8,
      marginBottom: 16,
    },
    error: { color: c.danger, marginBottom: 12 },
    empty: { color: c.textMuted, textAlign: 'center' as const, marginTop: 24 },
    sno: {
      width: 28,
      height: 28,
      borderRadius: 8,
      textAlign: 'center' as const,
      overflow: 'hidden' as const,
      color: c.chromeInk,
      backgroundColor: c.chrome,
      fontWeight: '800' as const,
      lineHeight: 28,
    },
    mapName: { color: c.text, fontWeight: '800' as const, fontSize: 17 },
    mapMeta: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    uploadChip: {
      alignSelf: 'flex-start' as const,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.chrome,
      marginBottom: 12,
    },
    uploadChipText: {
      color: c.chromeInk,
      fontWeight: '700' as const,
      fontSize: 13,
    },
    secondaryChip: {
      alignSelf: 'flex-start' as const,
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 6,
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
    },
    secondaryChipText: {
      color: c.link,
      fontWeight: '700' as const,
      fontSize: 13,
    },
    uploadChipCompactText: {
      color: c.link,
      fontWeight: '700' as const,
      fontSize: 12,
    },
    formSheet: {
      borderRadius: 16,
      padding: 16,
      backgroundColor: c.bg,
      borderWidth: 1,
      borderColor: c.border,
      gap: 10,
    },
    formTitle: {
      color: c.text,
      fontWeight: '800' as const,
      fontSize: 18,
      marginBottom: 4,
    },
    formInput: {
      borderWidth: 1,
      borderColor: c.border,
      backgroundColor: c.surface,
      borderRadius: 12,
      paddingHorizontal: 12,
      paddingVertical: 12,
      color: c.text,
      fontSize: 15,
    },
    tierPick: {
      flex: 1,
      alignItems: 'center' as const,
      paddingVertical: 10,
      borderRadius: 10,
      borderWidth: 1,
      borderColor: c.border,
    },
    tierPickActive: {
      backgroundColor: c.chrome,
      borderColor: c.chrome,
    },
    tierPickText: {
      color: c.textMuted,
      fontWeight: '700' as const,
      fontSize: 12,
      textTransform: 'capitalize' as const,
    },
    tierPickTextActive: { color: c.chromeInk },
    dropEyebrow: {
      color: c.textDim,
      fontSize: 11,
      fontWeight: '700' as const,
      letterSpacing: 1,
      textTransform: 'uppercase' as const,
      marginBottom: 8,
    },
    tierPrimary: { backgroundColor: c.chrome, color: c.chromeInk },
    tierSecondary: {
      backgroundColor: 'rgba(255,255,255,0.12)',
      color: c.text,
    },
    tierExtra: {
      backgroundColor: 'rgba(168,176,255,0.2)',
      color: c.link,
    },
    dropName: {
      color: c.text,
      fontWeight: '700' as const,
      fontSize: 13,
      marginTop: 8,
    },
    dropNote: { color: c.textMuted, fontSize: 11, marginTop: 2 },
    modalBar: {
      flexDirection: 'row' as const,
      alignItems: 'center' as const,
      gap: 8,
      paddingHorizontal: 12,
      paddingBottom: 12,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: c.border,
      zIndex: 5,
    },
    modalTitle: { color: c.text, fontWeight: '800' as const, fontSize: 17 },
    modalNote: { color: c.textMuted, fontSize: 12, marginTop: 2 },
    closeBtn: {
      width: 42,
      height: 42,
      borderRadius: 21,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.chrome,
    },
    railItem: {
      paddingHorizontal: 12,
      paddingVertical: 8,
      borderRadius: 10,
      backgroundColor: c.surface,
    },
    railItemActive: { backgroundColor: c.chrome },
    railLabel: { color: c.text, fontWeight: '700' as const, fontSize: 12 },
    railItemActiveLabel: { color: c.chromeInk },
    filterChipActive: {
      backgroundColor: c.chrome,
      borderColor: c.chrome,
    },
    filterLabel: { color: c.textMuted, fontWeight: '700' as const, fontSize: 12 },
    filterLabelActive: { color: c.chromeInk },
    pin: {
      position: 'absolute' as const,
      width: PIN_SIZE,
      height: PIN_SIZE,
      borderRadius: PIN_SIZE / 2,
      alignItems: 'center' as const,
      justifyContent: 'center' as const,
      backgroundColor: c.chrome,
      borderWidth: 2,
      borderColor: '#050507',
    },
  };
}

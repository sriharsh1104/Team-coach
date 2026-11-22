import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  LayoutChangeEvent,
  Modal,
  PanResponder,
  Pressable,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { Image } from 'expo-image';
import * as ImageManipulator from 'expo-image-manipulator';
import { AppIcon } from '../../ui/AppIcon';
import { haptic } from '../../ui/haptics';
import { emitToast } from '../../ui/toastBus';
import { useTheme } from '../../theme/ThemeContext';
import {
  ASPECT_PRESETS,
  clampCrop,
  fitContain,
  initialCrop,
  isFullFrame,
  toSourceRect,
  type Rect,
} from './cropGeometry';

type Corner = 'tl' | 'tr' | 'bl' | 'br';

const HANDLE = 28;

export type CroppedImage = {
  uri: string;
  width: number;
  height: number;
};

/**
 * Crop the photo the user just picked, before it goes out. Drag the frame or
 * any corner; Free / 1:1 / 4:5 / 16:9 lock the shape; Rotate turns the photo
 * a quarter turn at a time.
 *
 * Sending without touching anything skips the manipulator entirely, so the
 * common "just send it" path costs nothing — see `isFullFrame`.
 */
export function ImageCropModal({
  uri,
  width,
  height,
  onCancel,
  onDone,
}: {
  /** Local image URI; null hides the modal. */
  uri: string | null;
  /** Source pixel size. Falls back to a square guess when unknown. */
  width?: number | null;
  height?: number | null;
  onCancel: () => void;
  onDone: (result: CroppedImage) => void;
}) {
  const { colors } = useTheme();
  const [box, setBox] = useState({ width: 0, height: 0 });
  const [aspectKey, setAspectKey] = useState('free');
  const [rotation, setRotation] = useState(0);
  const [busy, setBusy] = useState(false);
  const [crop, setCrop] = useState<Rect>({ x: 0, y: 0, width: 0, height: 0 });
  const cropRef = useRef(crop);
  cropRef.current = crop;
  const dragStart = useRef<Rect>(crop);

  const aspect = useMemo(
    () => ASPECT_PRESETS.find((p) => p.key === aspectKey)?.value ?? null,
    [aspectKey],
  );

  // A quarter turn swaps the visible dimensions, so the frame has to be laid
  // out against the rotated size or the crop would map onto the wrong pixels.
  const srcW = width && width > 0 ? width : 1000;
  const srcH = height && height > 0 ? height : 1000;
  const turned = rotation % 180 !== 0;
  const viewW = turned ? srcH : srcW;
  const viewH = turned ? srcW : srcH;

  const display = useMemo(
    () => fitContain(viewW, viewH, box.width, box.height),
    [viewW, viewH, box.width, box.height],
  );

  // Reset the frame whenever the stage, the locked shape or the rotation
  // changes — a stale rect would sit outside the new image bounds.
  useEffect(() => {
    if (display.width <= 0) return;
    setCrop(initialCrop(display, aspect));
  }, [display.width, display.height, display.x, display.y, aspect]);

  useEffect(() => {
    if (!uri) {
      setRotation(0);
      setAspectKey('free');
    }
  }, [uri]);

  const onLayout = (e: LayoutChangeEvent) => {
    const { width: w, height: h } = e.nativeEvent.layout;
    setBox((prev) => (prev.width === w && prev.height === h ? prev : { width: w, height: h }));
  };

  const bodyResponder = useMemo(
    () =>
      PanResponder.create({
        onStartShouldSetPanResponder: () => true,
        onMoveShouldSetPanResponder: () => true,
        onPanResponderGrant: () => {
          dragStart.current = cropRef.current;
        },
        onPanResponderMove: (_e, g) => {
          const start = dragStart.current;
          setCrop(
            clampCrop(
              { ...start, x: start.x + g.dx, y: start.y + g.dy },
              display,
              aspect,
              'move',
            ),
          );
        },
      }),
    [display, aspect],
  );

  const cornerResponder = (corner: Corner) =>
    PanResponder.create({
      onStartShouldSetPanResponder: () => true,
      onMoveShouldSetPanResponder: () => true,
      onPanResponderGrant: () => {
        dragStart.current = cropRef.current;
      },
      onPanResponderMove: (_e, g) => {
        const s = dragStart.current;
        // Dragging a left/top handle grows the rect the other way, so the
        // delta is subtracted there; clampCrop re-pins the opposite corner.
        const next: Rect = {
          x: corner === 'tl' || corner === 'bl' ? s.x + g.dx : s.x,
          y: corner === 'tl' || corner === 'tr' ? s.y + g.dy : s.y,
          width:
            corner === 'tl' || corner === 'bl' ? s.width - g.dx : s.width + g.dx,
          height:
            corner === 'tl' || corner === 'tr' ? s.height - g.dy : s.height + g.dy,
        };
        setCrop(clampCrop(next, display, aspect, corner));
      },
    });

  // One responder per corner, rebuilt only when the geometry it closes over
  // changes — recreating them every render dropped drags mid-gesture.
  const corners = useMemo(
    () => ({
      tl: cornerResponder('tl'),
      tr: cornerResponder('tr'),
      bl: cornerResponder('bl'),
      br: cornerResponder('br'),
    }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [display, aspect],
  );

  const apply = async () => {
    if (!uri || busy) return;
    setBusy(true);
    try {
      const untouched = isFullFrame(crop, display) && rotation === 0;
      if (untouched) {
        onDone({ uri, width: srcW, height: srcH });
        return;
      }
      const actions: ImageManipulator.Action[] = [];
      if (rotation !== 0) actions.push({ rotate: rotation });
      if (!isFullFrame(crop, display)) {
        actions.push({ crop: toSourceRect(crop, display, viewW, viewH) });
      }
      const out = await ImageManipulator.manipulateAsync(uri, actions, {
        compress: 0.92,
        format: ImageManipulator.SaveFormat.JPEG,
      });
      haptic('success');
      onDone({ uri: out.uri, width: out.width, height: out.height });
    } catch (err) {
      console.warn('crop failed:', err);
      haptic('error');
      // Never strand the photo: fall back to sending it uncropped.
      emitToast('Could not crop that photo — sending it as it is.');
      onDone({ uri, width: srcW, height: srcH });
    } finally {
      setBusy(false);
    }
  };

  const handleStyles: Record<Corner, object> = {
    tl: { left: crop.x - HANDLE / 2, top: crop.y - HANDLE / 2 },
    tr: { left: crop.x + crop.width - HANDLE / 2, top: crop.y - HANDLE / 2 },
    bl: { left: crop.x - HANDLE / 2, top: crop.y + crop.height - HANDLE / 2 },
    br: {
      left: crop.x + crop.width - HANDLE / 2,
      top: crop.y + crop.height - HANDLE / 2,
    },
  };

  return (
    <Modal
      visible={!!uri}
      transparent={false}
      animationType="slide"
      onRequestClose={onCancel}
    >
      <View style={styles.root}>
        <View style={styles.stage} onLayout={onLayout}>
          {uri ? (
            <Image
              source={{ uri }}
              style={[
                styles.image,
                {
                  // `display` is measured against the ROTATED dimensions, so
                  // a quarter-turned photo is laid out at the size it will
                  // occupy and then spun about its own centre to match.
                  left: turned ? display.x + (display.width - display.height) / 2 : display.x,
                  top: turned ? display.y + (display.height - display.width) / 2 : display.y,
                  width: turned ? display.height : display.width,
                  height: turned ? display.width : display.height,
                  transform: rotation ? [{ rotate: `${rotation}deg` }] : undefined,
                },
              ]}
              contentFit="fill"
              transition={0}
            />
          ) : null}

          {display.width > 0 && (
            <>
              {/* Dim everything outside the frame. */}
              <View
                style={[styles.shade, { height: Math.max(0, crop.y) }]}
                pointerEvents="none"
              />
              <View
                style={[
                  styles.shade,
                  { top: crop.y + crop.height, bottom: 0 },
                ]}
                pointerEvents="none"
              />
              <View
                style={[
                  styles.shade,
                  { top: crop.y, height: crop.height, width: Math.max(0, crop.x) },
                ]}
                pointerEvents="none"
              />
              <View
                style={[
                  styles.shade,
                  {
                    top: crop.y,
                    height: crop.height,
                    left: crop.x + crop.width,
                    right: 0,
                  },
                ]}
                pointerEvents="none"
              />

              <View
                style={[
                  styles.frame,
                  {
                    left: crop.x,
                    top: crop.y,
                    width: crop.width,
                    height: crop.height,
                  },
                ]}
                {...bodyResponder.panHandlers}
              >
                <View style={styles.thirdV} pointerEvents="none" />
                <View style={styles.thirdV2} pointerEvents="none" />
                <View style={styles.thirdH} pointerEvents="none" />
                <View style={styles.thirdH2} pointerEvents="none" />
              </View>

              {(['tl', 'tr', 'bl', 'br'] as Corner[]).map((c) => (
                <View
                  key={c}
                  style={[styles.handle, handleStyles[c]]}
                  {...corners[c].panHandlers}
                >
                  <View style={styles.handleDot} />
                </View>
              ))}
            </>
          )}
        </View>

        <View style={[styles.sheet, { backgroundColor: colors.bg, borderTopColor: colors.border }]}>
          <View style={styles.presetRow}>
            {ASPECT_PRESETS.map((preset) => {
              const on = preset.key === aspectKey;
              return (
                <Pressable
                  key={preset.key}
                  style={[
                    styles.preset,
                    { borderColor: colors.border },
                    on && { backgroundColor: colors.chrome, borderColor: colors.chrome },
                  ]}
                  onPress={() => {
                    haptic('selection');
                    setAspectKey(preset.key);
                  }}
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={`Crop ${preset.label}`}
                >
                  <Text
                    style={[
                      styles.presetText,
                      { color: on ? colors.chromeInk : colors.textMuted },
                    ]}
                  >
                    {preset.label}
                  </Text>
                </Pressable>
              );
            })}
            <Pressable
              style={[styles.preset, { borderColor: colors.border }]}
              onPress={() => {
                haptic('selection');
                setRotation((r) => (r + 90) % 360);
              }}
              accessibilityRole="button"
              accessibilityLabel="Rotate photo"
            >
              <AppIcon name="refresh" size={16} color={colors.textMuted} />
            </Pressable>
          </View>

          <View style={styles.actions}>
            <Pressable
              style={[styles.ghost, { backgroundColor: colors.surface, borderColor: colors.border }]}
              onPress={onCancel}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Discard photo"
            >
              <Text style={[styles.ghostText, { color: colors.text }]}>Discard</Text>
            </Pressable>
            <Pressable
              style={[styles.send, { backgroundColor: colors.chrome }]}
              onPress={() => void apply()}
              disabled={busy}
              accessibilityRole="button"
              accessibilityLabel="Send photo"
            >
              {busy ? (
                <ActivityIndicator color={colors.chromeInk} />
              ) : (
                <Text style={[styles.sendText, { color: colors.chromeInk }]}>Send</Text>
              )}
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const GREEN = '#22c55e';

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: '#000' },
  stage: { flex: 1, overflow: 'hidden' },
  image: { position: 'absolute' },
  shade: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 0,
    backgroundColor: 'rgba(0,0,0,0.55)',
  },
  frame: {
    position: 'absolute',
    borderWidth: 2,
    borderColor: '#fff',
  },
  thirdV: {
    position: 'absolute',
    left: '33.33%',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  thirdV2: {
    position: 'absolute',
    left: '66.66%',
    top: 0,
    bottom: 0,
    width: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  thirdH: {
    position: 'absolute',
    top: '33.33%',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  thirdH2: {
    position: 'absolute',
    top: '66.66%',
    left: 0,
    right: 0,
    height: StyleSheet.hairlineWidth,
    backgroundColor: 'rgba(255,255,255,0.45)',
  },
  handle: {
    position: 'absolute',
    width: HANDLE,
    height: HANDLE,
    alignItems: 'center',
    justifyContent: 'center',
  },
  handleDot: {
    width: 14,
    height: 14,
    borderRadius: 7,
    backgroundColor: GREEN,
    borderWidth: 2,
    borderColor: '#fff',
  },
  sheet: {
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 28,
    borderTopWidth: 1,
    gap: 12,
  },
  presetRow: { flexDirection: 'row', gap: 8 },
  preset: {
    flex: 1,
    height: 38,
    borderRadius: 10,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  presetText: { fontSize: 13, fontWeight: '700' },
  actions: { flexDirection: 'row', gap: 10 },
  ghost: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    borderWidth: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  ghostText: { fontSize: 15, fontWeight: '600' },
  send: {
    flex: 1,
    height: 46,
    borderRadius: 12,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendText: { fontSize: 15, fontWeight: '700' },
});

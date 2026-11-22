package com.teamcoach.voicechanger

import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import livekit.org.webrtc.ExternalAudioProcessingFactory

/**
 * Real-time voice effect on WebRTC's capture path (after echo cancellation /
 * noise suppression, before the Opus encoder), so whatever leaves the phone —
 * mediasoup or LiveKit — is already the changed voice.
 *
 * WebRTC hands us the APM's split-band view of the mic signal: `numBands`
 * sub-bands of `numFrames` floats each (band-major, native byte order,
 * channel 0 only), on the **int16 scale** (±32767), not ±1.0. Band 0 is
 * 0–8 kHz at a 16 kHz rate, which carries every part of speech that matters,
 * so the effect runs there and the higher bands are muted while a preset is
 * active — they would otherwise carry un-shifted highs that sound like a
 * second person talking underneath.
 *
 * ---- What used to break ----
 * Three faults stacked up and turned every preset into crackling mush, which
 * is why "Woman" sounded like neither a woman nor the original voice:
 *
 *  1. CLIPPING. The two crossfaded taps are the same signal at two delays, so
 *     they are highly correlated and their sin/cos gains sum to as much as
 *     √2 ≈ 1.41 at the seam. With the old 0.95 output gain that is 1.34x the
 *     input, and WebRTC's capture AGC already leaves speech peaks near full
 *     scale — so every loud syllable hit the hard clamp at ±32767. Hard
 *     clipping is exactly the "fat jata" crackle. The gains are now
 *     normalised so the pair can never sum above unity, and the final clamp
 *     is a soft knee rather than a brick wall.
 *
 *  2. ALIASING. Band 0 is sampled at 16 kHz, so its Nyquist is 8 kHz.
 *     Shifting up by `r` folds everything above 8000/r back into the band as
 *     inharmonic noise. At the old +8 semitones that was everything above
 *     5 kHz; at +16 it was everything above 3.2 kHz — i.e. most consonant
 *     energy became garbage. There is now an anti-alias lowpass ahead of the
 *     shifter, tuned to whatever the current ratio can carry.
 *
 *  3. TOO MUCH SHIFT. A delay-line shifter moves the formants with the
 *     pitch, so past about +8 semitones it stops sounding like a person at
 *     all. The old ±8 / +12 / +16 were chasing audibility that the aliasing
 *     and clipping were destroying anyway. With a clean signal, half that is
 *     plainly audible — and a gentle spectral tilt opposing the shift pulls
 *     the timbre back toward a human voice instead of a cartoon.
 *
 * ---- Choosing the pitch ----
 * Typical speaking fundamental (F0):
 *   adult man     85–155 Hz  (avg ~120)
 *   adult woman  165–255 Hz  (avg ~210)
 *   child        250–400 Hz  (avg ~300)
 * An octave is 12 semitones (ratio 2.0). We cannot know who is talking, so
 * every preset is a *relative* move big enough to clear the ~3-4 semitone
 * "this is obviously processed" threshold from either starting voice:
 *   MAN    -6  : woman 210 → 149 Hz (male range), man 120 → 85 Hz (deep)
 *   WOMAN  +6  : man   120 → 170 Hz (female range), woman 210 → 297 Hz
 *   GIRL   +9  : man   120 → 202 Hz, woman 210 → 353 Hz
 *   CHILD  +12 : an octave — man 120 → 240 Hz, woman 210 → 420 Hz
 */
class VoiceEffectProcessor : ExternalAudioProcessingFactory.AudioProcessing {

  /**
   * @param semitones  pitch move, + is up
   * @param ringModHz  ring-modulator carrier (0 = off)
   * @param ringMix    how much of the ring-modulated signal to blend in
   * @param formantTilt  dB of shelf opposing the shift, applied above 1.6 kHz.
   *   A pure pitch shift drags the formants along with the pitch; pulling the
   *   upper band back down (up-shift) or lifting it (down-shift) is a cheap
   *   stand-in for real formant correction and is most of what makes the
   *   result read as a different *person* rather than a tape played at the
   *   wrong speed.
   */
  enum class Preset(
    val semitones: Double,
    val ringModHz: Double,
    val ringMix: Double,
    val formantTilt: Double,
  ) {
    OFF(0.0, 0.0, 0.0, 0.0),
    MAN(-6.0, 0.0, 0.0, 2.5),
    WOMAN(6.0, 0.0, 0.0, -3.0),
    GIRL(9.0, 0.0, 0.0, -4.0),
    CHILD(12.0, 0.0, 0.0, -5.0),
    // A robot is the ring modulator's doing, not the pitch shifter's — a big
    // shift on top only muddied it.
    ROBOT(-2.0, 50.0, 0.7, 0.0);

    companion object {
      fun fromName(name: String): Preset? =
        values().firstOrNull { it.name.equals(name, ignoreCase = true) }
    }
  }

  private companion object {
    const val TAG = "VoiceChanger"

    /** WebRTC float audio is on the int16 scale. */
    const val FULL_SCALE = 32767f

    /**
     * Where the soft limiter starts bending (-2.5 dBFS). Below this the
     * signal is untouched; above it the knee compresses towards full scale
     * instead of slicing the top off the waveform.
     */
    const val LIMIT_KNEE = 0.75f * FULL_SCALE
  }

  @Volatile var preset: Preset = Preset.OFF

  /**
   * Soft-gates low-level background noise. Off by default — the gate was
   * pumping mid-sentence (open/close flutter) and came through as a "ghrr
   * ghrr" rumble on calls. WebRTC noiseSuppression already covers fans/AC.
   */
  @Volatile var noiseGateEnabled: Boolean = false

  /** Last layout WebRTC actually handed us — surfaced to JS for diagnosis. */
  @Volatile var lastBandRate: Int = 0
    private set
  @Volatile var lastBands: Int = 0
    private set
  @Volatile var lastFrames: Int = 0
    private set
  /** True when the buffer layout was not one we can work with. */
  @Volatile var layoutUnsupported: Boolean = false
    private set
  /** Frames processed with a preset on — proves the effect is really running. */
  @Volatile var processedFrames: Long = 0L
    private set

  private var bandRate = 16000
  private val shifter = PitchShifter()
  private val gate = NoiseGate()
  private val antiAlias = Biquad()
  private val tilt = Shelf()
  private var ringPhase = 0.0
  private var scratch = FloatArray(0)
  private var zeros = FloatArray(0)
  private var loggedKey = 0L

  override fun initialize(sampleRateHz: Int, numChannels: Int) {
    bandRate = sampleRateHz
    resetChain()
    Log.i(TAG, "initialize rate=$sampleRateHz channels=$numChannels")
  }

  override fun reset(newRate: Int) {
    bandRate = newRate
    resetChain()
    Log.i(TAG, "reset rate=$newRate")
  }

  private fun resetChain() {
    shifter.reset()
    gate.reset()
    antiAlias.reset()
    tilt.reset()
    ringPhase = 0.0
  }

  override fun process(numBands: Int, numFrames: Int, buffer: ByteBuffer) {
    val p = preset
    val gateOn = noiseGateEnabled
    if ((!gateOn && p == Preset.OFF) || numBands <= 0 || numFrames <= 0) return

    // How many samples one band holds. WebRTC's wrapper reports `numFrames`
    // per band; fall back to "whole buffer / bands" when the buffer is
    // smaller, so a layout mismatch cannot make the effect silently do
    // nothing (which just reads as "the voice changer is broken").
    val capacityFloats = buffer.capacity() / 4
    val perBand: Int = when {
      numBands * numFrames <= capacityFloats -> numFrames
      capacityFloats >= numBands && capacityFloats % numBands == 0 -> capacityFloats / numBands
      else -> {
        layoutUnsupported = true
        logLayout(numBands, numFrames, capacityFloats, -1, p)
        return
      }
    }
    layoutUnsupported = false
    logLayout(numBands, numFrames, capacityFloats, perBand, p)

    buffer.clear()
    val fb = buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()
    if (scratch.size < perBand) scratch = FloatArray(perBand)
    val x = scratch

    fb.position(0)
    fb.get(x, 0, perBand)

    // Sample rate of one band (16 kHz for the 16/32/48 kHz capture rates).
    val rate = if (numBands > 1) (bandRate / numBands).coerceAtLeast(8000) else bandRate
    lastBandRate = rate
    lastBands = numBands
    lastFrames = perBand

    if (gateOn) {
      gate.setRate(rate)
      gate.process(x, perBand)
    }

    if (p != Preset.OFF) {
      val ratio = 2.0.pow(p.semitones / 12.0)

      // Anti-alias BEFORE shifting up: content above nyquist/ratio would fold
      // back into the band as inharmonic noise once it is moved up.
      if (ratio > 1.0) {
        val nyquist = rate / 2.0
        antiAlias.setLowpass(rate, (nyquist / ratio).coerceIn(2000.0, nyquist * 0.95))
        antiAlias.process(x, perBand)
      }

      shifter.setRate(rate)
      shifter.ratio = ratio
      shifter.process(x, perBand)

      if (p.formantTilt != 0.0) {
        tilt.set(rate, 1600.0, p.formantTilt)
        tilt.process(x, perBand)
      }

      if (p.ringMix > 0.0 && p.ringModHz > 0.0) {
        val inc = 2.0 * PI * p.ringModHz / rate
        val dry = 1.0 - p.ringMix
        for (i in 0 until perBand) {
          x[i] = (x[i] * (dry + p.ringMix * sin(ringPhase))).toFloat()
          ringPhase += inc
          if (ringPhase > 2.0 * PI) ringPhase -= 2.0 * PI
        }
      }
      processedFrames += perBand.toLong()
    }

    softLimit(x, perBand)

    fb.position(0)
    fb.put(x, 0, perBand)

    // Mute the upper bands (8 kHz+) while shifting — see the class doc.
    if (p != Preset.OFF && numBands > 1) {
      if (zeros.size < perBand) zeros = FloatArray(perBand)
      for (band in 1 until numBands) {
        fb.position(band * perBand)
        fb.put(zeros, 0, perBand)
      }
    }
  }

  /**
   * Soft knee instead of the old hard clamp. Slicing the top off a waveform
   * generates broadband harmonics — the crackle people heard as the voice
   * "breaking up". Bending the last few dB instead keeps peaks inside full
   * scale without that.
   */
  private fun softLimit(x: FloatArray, n: Int) {
    val knee = LIMIT_KNEE
    val range = FULL_SCALE - knee
    for (i in 0 until n) {
      val v = x[i]
      val mag = abs(v)
      if (mag <= knee) continue
      val over = (mag - knee) / range
      // over/(1+over) saturates towards 1, so magnitude tends to FULL_SCALE
      // and never passes it.
      val shaped = knee + range * (over / (1f + over))
      x[i] = if (v < 0) -shaped else shaped
    }
  }

  /** Logs the buffer layout once per change, so logcat shows what WebRTC gives us. */
  private fun logLayout(numBands: Int, numFrames: Int, capacity: Int, perBand: Int, p: Preset) {
    val key = (numBands.toLong() shl 48) xor (numFrames.toLong() shl 32) xor
      (capacity.toLong() shl 16) xor perBand.toLong() xor (p.ordinal.toLong() shl 56)
    if (key == loggedKey) return
    loggedKey = key
    Log.i(
      TAG,
      "process: bands=$numBands frames=$numFrames capacity=$capacity perBand=$perBand " +
        "rate=$bandRate preset=${p.name}" +
        if (perBand < 0) " (UNSUPPORTED LAYOUT, audio untouched)" else "",
    )
  }

  /**
   * Soft noise gate for gaming rooms: hush fans / AC / keyboard when you are
   * not speaking. WebRTC float samples sit on the int16 scale (±32767).
   * Open/close hysteresis + fast attack / slower release avoid choppy words.
   */
  private class NoiseGate {
    private companion object {
      const val OPEN_RMS = 900f
      const val CLOSE_RMS = 450f
      const val CLOSED_GAIN = 0.05f
      const val ATTACK_MS = 8.0
      const val RELEASE_MS = 120.0
    }

    private var open = false
    private var gain = CLOSED_GAIN
    private var attackCoef = 0.5f
    private var releaseCoef = 0.02f

    fun setRate(rate: Int) {
      val r = rate.coerceAtLeast(8000).toDouble()
      attackCoef = (1.0 - exp(-1.0 / (r * ATTACK_MS / 1000.0))).toFloat()
      releaseCoef = (1.0 - exp(-1.0 / (r * RELEASE_MS / 1000.0))).toFloat()
    }

    fun reset() {
      open = false
      gain = CLOSED_GAIN
    }

    fun process(x: FloatArray, n: Int) {
      if (n <= 0) return
      var sumSq = 0.0
      for (i in 0 until n) {
        val v = x[i]
        sumSq += (v * v).toDouble()
      }
      val rms = sqrt(sumSq / n).toFloat()
      if (open) {
        if (rms < CLOSE_RMS) open = false
      } else if (rms >= OPEN_RMS) {
        open = true
      }
      val target = if (open) 1f else CLOSED_GAIN
      val coef = if (target > gain) attackCoef else releaseCoef
      gain += (target - gain) * coef
      if (gain < 0.999f) {
        for (i in 0 until n) x[i] *= gain
      }
    }
  }

  /** Second-order lowpass (RBJ cookbook), used as the anti-alias filter. */
  private class Biquad {
    private var b0 = 1.0
    private var b1 = 0.0
    private var b2 = 0.0
    private var a1 = 0.0
    private var a2 = 0.0
    private var x1 = 0.0
    private var x2 = 0.0
    private var y1 = 0.0
    private var y2 = 0.0
    private var cachedRate = 0
    private var cachedCutoff = 0.0

    fun reset() {
      x1 = 0.0; x2 = 0.0; y1 = 0.0; y2 = 0.0
    }

    fun setLowpass(rate: Int, cutoffHz: Double) {
      // Recomputing coefficients every 10 ms frame would be wasted work and
      // would also zipper the filter; only redo it when something moved.
      if (rate == cachedRate && abs(cutoffHz - cachedCutoff) < 1.0) return
      cachedRate = rate
      cachedCutoff = cutoffHz

      val w0 = 2.0 * PI * cutoffHz / rate
      val cosW = cos(w0)
      val sinW = sin(w0)
      // Butterworth Q — flat passband, no resonant peak to add its own colour.
      val alpha = sinW / (2.0 * 0.7071)
      val a0 = 1.0 + alpha
      b0 = ((1.0 - cosW) / 2.0) / a0
      b1 = (1.0 - cosW) / a0
      b2 = b0
      a1 = (-2.0 * cosW) / a0
      a2 = (1.0 - alpha) / a0
    }

    fun process(x: FloatArray, n: Int) {
      for (i in 0 until n) {
        val input = x[i].toDouble()
        val out = b0 * input + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2
        x2 = x1; x1 = input
        y2 = y1; y1 = out
        x[i] = out.toFloat()
      }
    }
  }

  /**
   * One-pole high shelf — the cheap stand-in for formant correction. A pitch
   * shift drags the formants with it, so pushing the upper band the other way
   * puts the timbre back in human territory.
   */
  private class Shelf {
    private var alpha = 0.0
    private var gain = 1.0
    private var lp = 0.0
    private var cachedRate = 0
    private var cachedDb = 0.0

    fun reset() {
      lp = 0.0
    }

    fun set(rate: Int, cornerHz: Double, db: Double) {
      if (rate == cachedRate && abs(db - cachedDb) < 0.01) return
      cachedRate = rate
      cachedDb = db
      alpha = 1.0 - exp(-2.0 * PI * cornerHz / rate)
      gain = 10.0.pow(db / 20.0)
    }

    fun process(x: FloatArray, n: Int) {
      for (i in 0 until n) {
        val v = x[i].toDouble()
        lp += alpha * (v - lp)
        // Low part untouched, high part scaled — a shelf, not a filter sweep.
        x[i] = (lp + (v - lp) * gain).toFloat()
      }
    }
  }

  /**
   * Classic delay-line pitch shifter: two read taps sweep a ring buffer at
   * (1 - ratio) samples per sample, half a window apart, crossfaded through
   * the seam.
   *
   * The window is ~40 ms: long enough to span several pitch periods of a deep
   * voice (90 Hz repeats every 11 ms), short enough that the sweep doesn't
   * sound like an echo.
   */
  private class PitchShifter {
    private companion object {
      const val WINDOW_SECONDS = 0.04
    }
    private val size = 8192 // power of two, > window at every supported rate
    private val mask = size - 1
    private val buf = FloatArray(size)
    private var writePos = 0
    private var window = 640
    private var phase = 0.0 // delay of tap A, in [0, window)
    @Volatile var ratio = 1.0

    fun setRate(rate: Int) {
      val w = (rate * WINDOW_SECONDS).toInt().coerceIn(256, size / 2)
      if (w != window) {
        window = w
        reset()
      }
    }

    fun reset() {
      buf.fill(0f)
      writePos = 0
      phase = 0.0
    }

    fun process(x: FloatArray, n: Int) {
      val r = ratio
      if (r == 1.0) return
      val step = 1.0 - r
      val half = window / 2.0
      val piOverWindow = PI / window
      for (i in 0 until n) {
        buf[writePos] = x[i]
        val dA = phase
        var dB = phase + half
        if (dB >= window) dB -= window
        val a = readAt(writePos - dA)
        val b = readAt(writePos - dB)

        // The two taps are the SAME signal at two delays, so they are highly
        // correlated: raw sin/cos gains sum to up to √2 and the result
        // clipped on every loud syllable. Normalising by the gain sum caps
        // the pair at unity — a correlated seam now passes through at the
        // input's own level instead of 3 dB hot.
        val gA = sin(piOverWindow * dA)
        val gB = sin(piOverWindow * dB)
        val norm = gA + gB
        x[i] = if (norm > 1e-6) (((a * gA + b * gB) / norm)).toFloat() else 0f

        phase += step
        if (phase >= window) phase -= window
        if (phase < 0) phase += window
        writePos = (writePos + 1) and mask
      }
    }

    private fun readAt(pos: Double): Double {
      var p = pos
      while (p < 0) p += size
      while (p >= size) p -= size
      val i0 = p.toInt()
      val frac = p - i0
      val i1 = (i0 + 1) and mask
      return buf[i0] * (1.0 - frac) + buf[i1] * frac
    }
  }
}

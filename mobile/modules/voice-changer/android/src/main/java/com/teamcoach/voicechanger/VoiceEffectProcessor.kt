package com.teamcoach.voicechanger

import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.pow
import kotlin.math.sin
import livekit.org.webrtc.ExternalAudioProcessingFactory

/**
 * Real-time voice effect that sits on WebRTC's capture path (after echo
 * cancellation / noise suppression, before the Opus encoder), so whatever
 * leaves the phone — mediasoup or LiveKit — is already the changed voice.
 *
 * WebRTC hands us the APM's split-band representation of the mic signal:
 * `numBands` sub-bands of `numFrames` float samples each (band-major, native
 * byte order, channel 0 only). Band 0 is 0–8 kHz at a 16 kHz rate, which is
 * where all the voice energy that matters lives, so the effect runs on band
 * 0 and the higher bands are muted while an effect is active (they would
 * otherwise carry un-shifted highs that sound like a second voice).
 *
 * Presets are deliberately cheap (no FFT): a two-tap crossfaded delay-line
 * pitch shifter (~40 ms added latency) plus a ring modulator for "robot".
 *
 * ---- Choosing the pitch (why these numbers) ----
 * Typical speaking fundamental (F0):
 *   adult man     85–155 Hz  (avg ~120)
 *   adult woman  165–255 Hz  (avg ~210)
 *   child        250–400 Hz  (avg ~300)
 * An octave is 12 semitones (ratio 2.0); one semitone is a ratio of 2^(1/12).
 * We can't know who is talking, so every preset is a *relative* move that
 * has to clear the ~3-4 semitone "this is obviously processed" threshold from
 * either starting voice:
 *   MAN    -5  : woman 210 → 157 Hz (male range), man 120 → 90 Hz (deep)
 *   WOMAN  +5  : man   120 → 160 Hz (female edge), woman 210 → 280 Hz
 *   GIRL   +8  : man   120 → 190 Hz, woman 210 → 333 Hz
 *   CHILD  +11 : man   120 → 226 Hz, woman 210 → 396 Hz  (kid range)
 * A plain pitch shift also scales the formants by the same ratio, so past
 * about +8 it starts to sound like a cartoon — that is the "child" sound.
 * The old values (±4 / +7 / +10) were small enough that most people heard
 * "the same voice".
 */
class VoiceEffectProcessor : ExternalAudioProcessingFactory.AudioProcessing {

  enum class Preset(val semitones: Double, val ringModHz: Double, val ringMix: Double) {
    OFF(0.0, 0.0, 0.0),
    MAN(-5.0, 0.0, 0.0),
    WOMAN(5.0, 0.0, 0.0),
    GIRL(8.0, 0.0, 0.0),
    CHILD(11.0, 0.0, 0.0),
    ROBOT(-2.0, 45.0, 0.8);

    companion object {
      fun fromName(name: String): Preset? =
        values().firstOrNull { it.name.equals(name, ignoreCase = true) }
    }
  }

  private companion object {
    const val TAG = "VoiceChanger"
    /** WebRTC float audio is on the int16 scale. */
    const val CLAMP = 32767f
  }

  @Volatile var preset: Preset = Preset.OFF

  private var bandRate = 16000
  private val shifter = PitchShifter()
  private var ringPhase = 0.0
  private var scratch = FloatArray(0)
  private var zeros = FloatArray(0)
  private var loggedKey = 0L

  override fun initialize(sampleRateHz: Int, numChannels: Int) {
    bandRate = sampleRateHz
    shifter.reset()
    ringPhase = 0.0
    Log.i(TAG, "initialize rate=$sampleRateHz channels=$numChannels")
  }

  override fun reset(newRate: Int) {
    bandRate = newRate
    shifter.reset()
    ringPhase = 0.0
    Log.i(TAG, "reset rate=$newRate")
  }

  override fun process(numBands: Int, numFrames: Int, buffer: ByteBuffer) {
    val p = preset
    if (p == Preset.OFF || numBands <= 0 || numFrames <= 0) return

    // Work out how many samples one band holds. WebRTC's wrapper reports
    // `numFrames` per band, but fall back to "whole buffer / bands" if the
    // buffer is smaller than that — otherwise a layout mismatch would make the
    // effect silently do nothing (the voice would just sound unchanged).
    val capacityFloats = buffer.capacity() / 4
    val perBand: Int = when {
      numBands * numFrames <= capacityFloats -> numFrames
      capacityFloats >= numBands && capacityFloats % numBands == 0 -> capacityFloats / numBands
      else -> {
        logLayout(numBands, numFrames, capacityFloats, -1, p)
        return
      }
    }
    logLayout(numBands, numFrames, capacityFloats, perBand, p)

    buffer.clear()
    val fb = buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()
    if (scratch.size < perBand) scratch = FloatArray(perBand)
    val x = scratch

    // Band 0 in, effect, band 0 out.
    fb.position(0)
    fb.get(x, 0, perBand)

    // Sample rate of one band (16 kHz for the 16/32/48 kHz capture rates).
    val rate = if (numBands > 1) (bandRate / numBands).coerceAtLeast(8000) else bandRate
    shifter.setRate(rate)
    shifter.ratio = 2.0.pow(p.semitones / 12.0)
    shifter.process(x, perBand)

    if (p.ringMix > 0.0 && p.ringModHz > 0.0) {
      val inc = 2.0 * PI * p.ringModHz / rate
      val dry = 1.0 - p.ringMix
      for (i in 0 until perBand) {
        x[i] = (x[i] * (dry + p.ringMix * sin(ringPhase))).toFloat()
        ringPhase += inc
        if (ringPhase > 2.0 * PI) ringPhase -= 2.0 * PI
      }
    }

    for (i in 0 until perBand) {
      val v = x[i]
      x[i] = if (v > CLAMP) CLAMP else if (v < -CLAMP) -CLAMP else v
    }

    fb.position(0)
    fb.put(x, 0, perBand)

    // Mute the upper bands (8 kHz+) while shifting — see class doc.
    if (numBands > 1) {
      if (zeros.size < perBand) zeros = FloatArray(perBand)
      for (band in 1 until numBands) {
        fb.position(band * perBand)
        fb.put(zeros, 0, perBand)
      }
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
        "rate=$bandRate preset=${p.name}" + if (perBand < 0) " (UNSUPPORTED LAYOUT, audio untouched)" else "",
    )
  }

  /**
   * Classic delay-line pitch shifter: two read taps sweep a ring buffer at
   * (1 - ratio) samples per sample, half a window apart, crossfaded with
   * sin/cos gains so power stays constant through the seam.
   *
   * The window is ~40 ms of audio: long enough to span several pitch periods
   * of a deep voice (a 90 Hz voice repeats every 11 ms), short enough that
   * the sweep doesn't sound like an echo.
   */
  private class PitchShifter {
    private companion object {
      // Sum of two crossfaded taps is ≈ 1.06x the input RMS at 0.707; 0.95 gives
      // roughly unity loudness (peaks are clamped by the caller).
      const val OUT_GAIN = 0.95
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
        val gA = sin(piOverWindow * dA)
        val gB = sin(piOverWindow * dB)
        x[i] = ((a * gA + b * gB) * OUT_GAIN).toFloat()

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

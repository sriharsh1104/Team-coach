package com.teamcoach.voicechanger

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
 * pitch shifter (~30 ms added latency) plus a ring modulator for "robot".
 */
class VoiceEffectProcessor : ExternalAudioProcessingFactory.AudioProcessing {

  enum class Preset(val semitones: Double, val ringModHz: Double, val ringMix: Double) {
    OFF(0.0, 0.0, 0.0),
    MAN(-4.0, 0.0, 0.0),
    WOMAN(4.0, 0.0, 0.0),
    GIRL(7.0, 0.0, 0.0),
    CHILD(10.0, 0.0, 0.0),
    ROBOT(-2.0, 45.0, 0.8);

    companion object {
      fun fromName(name: String): Preset? =
        values().firstOrNull { it.name.equals(name, ignoreCase = true) }
    }
  }

  @Volatile var preset: Preset = Preset.OFF

  private var bandRate = 16000
  private val shifter = PitchShifter()
  private var ringPhase = 0.0
  private var scratch = FloatArray(0)

  override fun initialize(sampleRateHz: Int, numChannels: Int) {
    bandRate = sampleRateHz
    shifter.reset()
    ringPhase = 0.0
  }

  override fun reset(newRate: Int) {
    bandRate = newRate
    shifter.reset()
    ringPhase = 0.0
  }

  override fun process(numBands: Int, numFrames: Int, buffer: ByteBuffer) {
    val p = preset
    if (p == Preset.OFF || numBands <= 0 || numFrames <= 0) return
    val needed = numBands * numFrames * 4
    if (buffer.capacity() < needed) return // unexpected layout — leave audio untouched

    val fb = buffer.order(ByteOrder.nativeOrder()).asFloatBuffer()
    if (scratch.size < numFrames) scratch = FloatArray(numFrames)
    val x = scratch

    // Band 0 in, effect, band 0 out.
    fb.position(0)
    fb.get(x, 0, numFrames)

    val rate = if (numBands > 1) bandRate / numBands else bandRate
    shifter.ratio = 2.0.pow(p.semitones / 12.0)
    shifter.process(x, numFrames)

    if (p.ringMix > 0.0 && p.ringModHz > 0.0) {
      val inc = 2.0 * PI * p.ringModHz / rate
      val dry = 1.0 - p.ringMix
      for (i in 0 until numFrames) {
        x[i] = (x[i] * (dry + p.ringMix * sin(ringPhase))).toFloat()
        ringPhase += inc
        if (ringPhase > 2.0 * PI) ringPhase -= 2.0 * PI
      }
    }

    fb.position(0)
    fb.put(x, 0, numFrames)

    // Mute the upper bands (8 kHz+) while shifting — see class doc.
    if (numBands > 1) {
      val zero = FloatArray(numFrames)
      for (band in 1 until numBands) {
        fb.position(band * numFrames)
        fb.put(zero, 0, numFrames)
      }
    }
  }

  /**
   * Classic delay-line pitch shifter: two read taps sweep a ring buffer at
   * (1 - ratio) samples per sample, half a window apart, crossfaded with
   * sin/cos gains so power stays constant through the seam.
   */
  private class PitchShifter(private val window: Int = 1024) {
    private companion object {
      const val INV_SQRT2 = 0.70710678
    }
    private val size = 4096 // power of two, > window
    private val mask = size - 1
    private val buf = FloatArray(size)
    private var writePos = 0
    private var phase = 0.0 // delay of tap A, in [0, window)
    @Volatile var ratio = 1.0

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
        // sin/cos taps sum to up to sqrt(2) when in phase; scale back so the
        // effect never adds gain (WebRTC clamps to int16 right after us).
        x[i] = ((a * gA + b * gB) * INV_SQRT2).toFloat()

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

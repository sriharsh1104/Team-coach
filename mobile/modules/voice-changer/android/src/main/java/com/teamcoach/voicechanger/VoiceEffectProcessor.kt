package com.teamcoach.voicechanger

import android.util.Log
import java.nio.ByteBuffer
import java.nio.ByteOrder
import kotlin.math.PI
import kotlin.math.abs
import kotlin.math.atan2
import kotlin.math.cos
import kotlin.math.exp
import kotlin.math.hypot
import kotlin.math.ln
import kotlin.math.max
import kotlin.math.min
import kotlin.math.pow
import kotlin.math.sin
import kotlin.math.sqrt
import livekit.org.webrtc.ExternalAudioProcessingFactory

/**
 * Real-time voice **morph** on WebRTC's capture path (after AEC/NS, before Opus).
 *
 * Old path was a delay-line pitch shifter + one-pole shelf. That only made the
 * tape play faster/slower (chipmunk / monster) — formants rode the pitch, so
 * "Woman" never sounded like a different person. This version uses an STFT
 * phase-vocoder that shifts **pitch** and **formants** independently, which is
 * what actual voice morph / gender morph needs.
 *
 * WebRTC hands us split-band floats on the **int16 scale** (±32767) most of the
 * time; some builds use ±1.0. We auto-detect per frame so neither layout turns
 * the effect into silence.
 */
class VoiceEffectProcessor : ExternalAudioProcessingFactory.AudioProcessing {

  /**
   * @param pitchSt     F0 move in semitones (+ = higher)
   * @param formantSt   vocal-tract (timbre) move in semitones — same direction
   *                    as pitch for gender morph; 0 keeps your throat shape
   * @param ringModHz   robot carrier (0 = off)
   * @param ringMix     robot wet mix
   */
  enum class Preset(
    val pitchSt: Double,
    val formantSt: Double,
    val ringModHz: Double,
    val ringMix: Double,
  ) {
    OFF(0.0, 0.0, 0.0, 0.0),
    // Pitch + formants move together → reads as a different person, not a chipmunk.
    MAN(-5.0, -4.0, 0.0, 0.0),
    WOMAN(6.0, 5.0, 0.0, 0.0),
    GIRL(9.0, 7.0, 0.0, 0.0),
    CHILD(11.0, 9.0, 0.0, 0.0),
    ROBOT(-1.0, 0.0, 55.0, 0.75);

    companion object {
      fun fromName(name: String): Preset? =
        values().firstOrNull { it.name.equals(name, ignoreCase = true) }
    }
  }

  private companion object {
    const val TAG = "VoiceChanger"
    const val INT16_FULL = 32767f
  }

  @Volatile var preset: Preset = Preset.OFF
  @Volatile var noiseGateEnabled: Boolean = false

  @Volatile var lastBandRate: Int = 0
    private set
  @Volatile var lastBands: Int = 0
    private set
  @Volatile var lastFrames: Int = 0
    private set
  @Volatile var layoutUnsupported: Boolean = false
    private set
  @Volatile var processedFrames: Long = 0L
    private set

  private var bandRate = 16000
  private val morph = StftMorphEngine()
  private val gate = NoiseGate()
  private var ringPhase = 0.0
  private var scratch = FloatArray(0)
  private var zeros = FloatArray(0)
  private var loggedKey = 0L
  /** Running peak used to decide int16 vs ±1 float scale. */
  private var peakAbs = 1f

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
    morph.reset()
    gate.reset()
    ringPhase = 0.0
    peakAbs = 1f
  }

  override fun process(numBands: Int, numFrames: Int, buffer: ByteBuffer) {
    val p = preset
    val gateOn = noiseGateEnabled
    if ((!gateOn && p == Preset.OFF) || numBands <= 0 || numFrames <= 0) return

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

    // Track peak so we know whether this build uses int16-scale or ±1.0 floats.
    var framePeak = 0f
    for (i in 0 until perBand) {
      val a = abs(x[i])
      if (a > framePeak) framePeak = a
    }
    peakAbs = peakAbs * 0.98f + framePeak * 0.02f
    val unitScale = peakAbs < 2.5f // ±1.0 float path
    val fullScale = if (unitScale) 1f else INT16_FULL

    val rate = if (numBands > 1) (bandRate / numBands).coerceAtLeast(8000) else bandRate
    lastBandRate = rate
    lastBands = numBands
    lastFrames = perBand

    if (gateOn) {
      gate.setRate(rate, fullScale)
      gate.process(x, perBand)
    }

    if (p != Preset.OFF) {
      // Normalize to ±1 for the morph engine, then scale back.
      if (!unitScale) {
        val inv = 1f / INT16_FULL
        for (i in 0 until perBand) x[i] *= inv
      }

      morph.setRate(rate)
      morph.setRatios(
        pitchRatio = 2.0.pow(p.pitchSt / 12.0),
        formantRatio = 2.0.pow(p.formantSt / 12.0),
      )
      morph.process(x, perBand)

      if (p.ringMix > 0.0 && p.ringModHz > 0.0) {
        val inc = 2.0 * PI * p.ringModHz / rate
        val dry = 1.0 - p.ringMix
        for (i in 0 until perBand) {
          x[i] = (x[i] * (dry + p.ringMix * sin(ringPhase))).toFloat()
          ringPhase += inc
          if (ringPhase > 2.0 * PI) ringPhase -= 2.0 * PI
        }
      }

      if (!unitScale) {
        for (i in 0 until perBand) x[i] *= INT16_FULL
      }
      softLimit(x, perBand, fullScale)
      processedFrames += perBand.toLong()
    }

    fb.position(0)
    fb.put(x, 0, perBand)

    // Mute upper bands while morphing so un-shifted highs don't leak through.
    if (p != Preset.OFF && numBands > 1) {
      if (zeros.size < perBand) zeros = FloatArray(perBand)
      for (band in 1 until numBands) {
        fb.position(band * perBand)
        fb.put(zeros, 0, perBand)
      }
    }
  }

  private fun softLimit(x: FloatArray, n: Int, fullScale: Float) {
    val knee = 0.78f * fullScale
    val range = fullScale - knee
    for (i in 0 until n) {
      val v = x[i]
      val mag = abs(v)
      if (mag <= knee) continue
      val over = (mag - knee) / range
      val shaped = knee + range * (over / (1f + over))
      x[i] = if (v < 0) -shaped else shaped
    }
  }

  private fun logLayout(numBands: Int, numFrames: Int, capacity: Int, perBand: Int, p: Preset) {
    val key = (numBands.toLong() shl 48) xor (numFrames.toLong() shl 32) xor
      (capacity.toLong() shl 16) xor perBand.toLong() xor (p.ordinal.toLong() shl 56)
    if (key == loggedKey) return
    loggedKey = key
    Log.i(
      TAG,
      "process: bands=$numBands frames=$numFrames capacity=$capacity perBand=$perBand " +
        "rate=$bandRate preset=${p.name} peak~$peakAbs" +
        if (perBand < 0) " (UNSUPPORTED LAYOUT)" else "",
    )
  }

  private class NoiseGate {
    private var open = false
    private var gain = 0.05f
    private var attackCoef = 0.5f
    private var releaseCoef = 0.02f
    private var openRms = 900f
    private var closeRms = 450f

    fun setRate(rate: Int, fullScale: Float) {
      val r = rate.coerceAtLeast(8000).toDouble()
      attackCoef = (1.0 - exp(-1.0 / (r * 8.0 / 1000.0))).toFloat()
      releaseCoef = (1.0 - exp(-1.0 / (r * 120.0 / 1000.0))).toFloat()
      openRms = 0.03f * fullScale
      closeRms = 0.015f * fullScale
    }

    fun reset() {
      open = false
      gain = 0.05f
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
        if (rms < closeRms) open = false
      } else if (rms >= openRms) {
        open = true
      }
      val target = if (open) 1f else 0.05f
      val coef = if (target > gain) attackCoef else releaseCoef
      gain += (target - gain) * coef
      if (gain < 0.999f) {
        for (i in 0 until n) x[i] *= gain
      }
    }
  }

  /**
   * Overlap-add STFT morph: independent pitch + formant ratios.
   *
   * Pipeline per hop:
   *  1. Windowed FFT
   *  2. Split magnitude into smooth spectral envelope + residual flat spectrum
   *  3. Resample residual bins by pitchRatio (moves F0 / harmonics)
   *  4. Resample envelope bins by formantRatio (moves vocal-tract resonances)
   *  5. Recombine, phase-vocoder advance, IFFT, overlap-add
   *
   * Latency ≈ fftSize at the band rate (~32 ms at 16 kHz / 512).
   */
  private class StftMorphEngine {
    private companion object {
      const val FFT = 512
      const val HOP = 128
      const val BINS = FFT / 2 + 1
    }

    private val hann = FloatArray(FFT) { i ->
      (0.5 - 0.5 * cos(2.0 * PI * i / FFT)).toFloat()
    }
    private val inRing = FloatArray(FFT * 4)
    private val outRing = FloatArray(FFT * 4)
    private val frame = FloatArray(FFT)
    private val re = FloatArray(FFT)
    private val im = FloatArray(FFT)
    private val mag = FloatArray(BINS)
    private val env = FloatArray(BINS)
    private val res = FloatArray(BINS)
    private val magOut = FloatArray(BINS)
    private val prevPhase = FloatArray(BINS)
    private val synthPhase = FloatArray(BINS)
    private var inPos = 0
    private var inFill = 0
    private var outRead = 0
    private var outWrite = 0
    private var outCount = 0
    private var rate = 16000
    private var pitchRatio = 1.0
    private var formantRatio = 1.0
    private var primed = false

    fun setRate(sampleRate: Int) {
      if (sampleRate != rate) {
        rate = sampleRate
        reset()
      }
    }

    fun setRatios(pitchRatio: Double, formantRatio: Double) {
      this.pitchRatio = pitchRatio.coerceIn(0.5, 2.2)
      this.formantRatio = formantRatio.coerceIn(0.5, 2.2)
    }

    fun reset() {
      inRing.fill(0f)
      outRing.fill(0f)
      prevPhase.fill(0f)
      synthPhase.fill(0f)
      inPos = 0
      inFill = 0
      outRead = 0
      outWrite = 0
      outCount = 0
      primed = false
    }

    fun process(x: FloatArray, n: Int) {
      if (abs(pitchRatio - 1.0) < 0.001 && abs(formantRatio - 1.0) < 0.001) return

      for (i in 0 until n) {
        inRing[(inPos + inFill) % inRing.size] = x[i]
        inFill++
        while (inFill >= HOP) {
          // Copy last FFT samples ending at current write head.
          val end = (inPos + HOP) % inRing.size
          var idx = (end - FFT + inRing.size) % inRing.size
          for (k in 0 until FFT) {
            frame[k] = inRing[idx] * hann[k]
            idx = (idx + 1) % inRing.size
          }
          inPos = (inPos + HOP) % inRing.size
          inFill -= HOP
          analyzeModifySynthesize()
          primed = true
        }
      }

      // Until OLA has backlog, leave dry samples in place (no mute gap on engage).
      if (!primed) return
      for (i in 0 until n) {
        if (outCount <= 0) break
        x[i] = outRing[outRead]
        outRing[outRead] = 0f
        outRead = (outRead + 1) % outRing.size
        outCount--
      }
    }

    private fun analyzeModifySynthesize() {
      // Real FFT via packed DFT (in-place on re/im).
      for (i in 0 until FFT) {
        re[i] = frame[i]
        im[i] = 0f
      }
      fft(re, im, inverse = false)

      for (k in 0 until BINS) {
        val mr = re[k]
        val mi = im[k]
        mag[k] = hypot(mr.toDouble(), mi.toDouble()).toFloat()
        val ph = atan2(mi.toDouble(), mr.toDouble()).toFloat()
        // Phase vocoder advance for pitched residual.
        val omega = (2.0 * PI * k * HOP / FFT).toFloat()
        var delta = ph - prevPhase[k] - omega
        // Wrap to [-pi, pi]
        delta -= (2.0 * PI * kotlin.math.floor((delta / (2.0 * PI) + 0.5))).toFloat()
        prevPhase[k] = ph
        synthPhase[k] += omega * pitchRatio.toFloat() + delta * pitchRatio.toFloat()
      }

      // Spectral envelope via cepstral liftering (low quefrency = envelope).
      estimateEnvelope(mag, env)
      for (k in 0 until BINS) {
        res[k] = mag[k] / max(env[k], 1e-6f)
      }

      magOut.fill(0f)
      // Resample residual by pitch, envelope by formant, recombine.
      for (k in 0 until BINS) {
        val srcRes = k / pitchRatio
        val srcEnv = k / formantRatio
        val r = sampleBin(res, srcRes)
        val e = sampleBin(env, srcEnv)
        magOut[k] = (r * e).toFloat()
      }

      // Rebuild Hermitian spectrum with new mag + accumulated phase.
      re.fill(0f)
      im.fill(0f)
      for (k in 0 until BINS) {
        val m = magOut[k]
        re[k] = (m * cos(synthPhase[k].toDouble())).toFloat()
        im[k] = (m * sin(synthPhase[k].toDouble())).toFloat()
      }
      for (k in 1 until FFT / 2) {
        re[FFT - k] = re[k]
        im[FFT - k] = -im[k]
      }
      fft(re, im, inverse = true)

      val norm = 1f / FFT
      // Hann + hop FFT/4 ≈ 1.5 COLA sum; a bit of makeup so the morph is obvious.
      val olaGain = 1.65f
      for (i in 0 until FFT) {
        val sample = re[i] * norm * hann[i] * olaGain
        val idx = (outWrite + i) % outRing.size
        outRing[idx] += sample
      }
      outWrite = (outWrite + HOP) % outRing.size
      outCount += HOP
      // Cap backlog so a stall cannot grow forever.
      if (outCount > outRing.size - FFT) {
        val drop = outCount - (outRing.size - FFT)
        outRead = (outRead + drop) % outRing.size
        outCount -= drop
      }
    }

    private fun sampleBin(arr: FloatArray, pos: Double): Double {
      if (pos <= 0.0) return arr[0].toDouble()
      if (pos >= arr.size - 1) return arr[arr.size - 1].toDouble()
      val i0 = pos.toInt()
      val frac = pos - i0
      return arr[i0] * (1.0 - frac) + arr[i0 + 1] * frac
    }

    /** Log-magnitude moving average ≈ spectral envelope. */
    private fun estimateEnvelope(magnitude: FloatArray, out: FloatArray) {
      val radius = 6
      for (k in magnitude.indices) {
        var sum = 0.0
        var count = 0
        val lo = max(0, k - radius)
        val hi = min(magnitude.size - 1, k + radius)
        for (j in lo..hi) {
          sum += ln(max(magnitude[j], 1e-8f).toDouble())
          count++
        }
        out[k] = exp(sum / count).toFloat()
      }
    }

    /** In-place Cooley–Tukey radix-2 FFT on re/im (length must be FFT). */
    private fun fft(reArr: FloatArray, imArr: FloatArray, inverse: Boolean) {
      val n = reArr.size
      var j = 0
      for (i in 1 until n) {
        var bit = n shr 1
        while (j and bit != 0) {
          j = j xor bit
          bit = bit shr 1
        }
        j = j xor bit
        if (i < j) {
          val tr = reArr[i]; reArr[i] = reArr[j]; reArr[j] = tr
          val ti = imArr[i]; imArr[i] = imArr[j]; imArr[j] = ti
        }
      }
      var len = 2
      while (len <= n) {
        val ang = (if (inverse) 2.0 else -2.0) * PI / len
        val wlenRe = cos(ang)
        val wlenIm = sin(ang)
        var i0 = 0
        while (i0 < n) {
          var wr = 1.0
          var wi = 0.0
          for (k in 0 until len / 2) {
            val uRe = reArr[i0 + k].toDouble()
            val uIm = imArr[i0 + k].toDouble()
            val vRe = wr * reArr[i0 + k + len / 2] - wi * imArr[i0 + k + len / 2]
            val vIm = wr * imArr[i0 + k + len / 2] + wi * reArr[i0 + k + len / 2]
            reArr[i0 + k] = (uRe + vRe).toFloat()
            imArr[i0 + k] = (uIm + vIm).toFloat()
            reArr[i0 + k + len / 2] = (uRe - vRe).toFloat()
            imArr[i0 + k + len / 2] = (uIm - vIm).toFloat()
            val nwr = wr * wlenRe - wi * wlenIm
            wi = wr * wlenIm + wi * wlenRe
            wr = nwr
          }
          i0 += len
        }
        len = len shl 1
      }
    }
  }
}

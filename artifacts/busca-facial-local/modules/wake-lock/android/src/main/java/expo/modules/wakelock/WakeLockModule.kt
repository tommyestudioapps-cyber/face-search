package expo.modules.wakelock

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.media.AudioAttributes
import android.media.AudioFormat
import android.media.AudioTrack
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.os.SystemClock
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition
import java.net.DatagramPacket
import java.net.DatagramSocket
import java.net.InetAddress

class WakeLockModule : Module() {
  private val lock = Any()
  private var wakeLock: PowerManager.WakeLock? = null
  private var keepAliveThread: Thread? = null

  @Volatile
  private var keepAliveActive: Boolean = false

  @Volatile
  private var expireAtElapsedRealtime: Long = 0L

  private fun ensureWakeLockHeldLocked(context: Context, durationMs: Long) {
    val powerManager = context.applicationContext.getSystemService(Context.POWER_SERVICE) as PowerManager
    val current = wakeLock ?: powerManager.newWakeLock(
      PowerManager.PARTIAL_WAKE_LOCK,
      "busca-facial-local:indexing"
    ).apply {
      setReferenceCounted(false)
    }.also {
      wakeLock = it
    }
    try {
      current.acquire(durationMs)
    } catch (_: Throwable) {
      // ignore defensive acquire errors
    }
  }

  private fun startKeepAliveThreadIfNeededLocked(context: Context) {
    val appCtx = context.applicationContext
    if (keepAliveActive && keepAliveThread?.isAlive == true) {
      return
    }
    keepAliveActive = true
    val thread = Thread({
      var track: AudioTrack? = null
      var udpSocket: DatagramSocket? = null
      try {
        val sampleRate = 8000
        val minBuf = AudioTrack.getMinBufferSize(
          sampleRate,
          AudioFormat.CHANNEL_OUT_MONO,
          AudioFormat.ENCODING_PCM_16BIT
        ).coerceAtLeast(1600)

        track = AudioTrack.Builder()
          .setAudioAttributes(
            AudioAttributes.Builder()
              .setUsage(AudioAttributes.USAGE_MEDIA)
              .setContentType(AudioAttributes.CONTENT_TYPE_MUSIC)
              .build()
          )
          .setAudioFormat(
            AudioFormat.Builder()
              .setEncoding(AudioFormat.ENCODING_PCM_16BIT)
              .setSampleRate(sampleRate)
              .setChannelMask(AudioFormat.CHANNEL_OUT_MONO)
              .build()
          )
          .setBufferSizeInBytes(minBuf * 2)
          .setTransferMode(AudioTrack.MODE_STREAM)
          .build()

        // Volume 0.01f com amostras PCM +1/-1 (1/32768):
        // 0.01 * 1 = 0 no mixer de 16 bits (100% inaudível), sem pedir AudioFocus
        // (não pausa nem reduz volume de músicas/vídeos), mantendo a sessão ativa
        // no AudioFlinger (AudioMix) para impedir congelamento OplusHansManager/LcdOff.
        track.setVolume(0.01f)
        track.play()

        // 1600 bytes = 800 amostras de 16 bits = 100ms a 8000 Hz
        val pcmBuffer = ByteArray(1600)
        var i = 0
        while (i + 3 < pcmBuffer.size) {
          // +1 (little-endian: 0x01, 0x00)
          pcmBuffer[i] = 1
          pcmBuffer[i + 1] = 0
          // -1 (little-endian: 0xFF, 0xFF)
          pcmBuffer[i + 2] = -1
          pcmBuffer[i + 3] = -1
          i += 4
        }

        val loopback = InetAddress.getByName("127.0.0.1")
        udpSocket = DatagramSocket(0, loopback).apply {
          soTimeout = 50
        }
        val localPort = udpSocket.localPort
        val pingPayload = byteArrayOf(0x01)
        val pingPacket = DatagramPacket(pingPayload, pingPayload.size, loopback, localPort)
        val recvBuffer = ByteArray(4)
        val recvPacket = DatagramPacket(recvBuffer, recvBuffer.size)

        var lastRenewalElapsed = SystemClock.elapsedRealtime()

        while (keepAliveActive) {
          val now = SystemClock.elapsedRealtime()
          val remainingMs = expireAtElapsedRealtime - now
          if (remainingMs <= 0L) {
            break
          }

          val written = track.write(pcmBuffer, 0, pcmBuffer.size)
          if (written < 0) {
            Thread.sleep(100)
          }

          if (now - lastRenewalElapsed >= 4_000L) {
            lastRenewalElapsed = now
            // 1. Re-adquire a PARTIAL_WAKE_LOCK caso o OplusProxyWakeLock a tenha derrubado
            synchronized(lock) {
              if (keepAliveActive) {
                val wl = wakeLock
                if (wl == null || !wl.isHeld) {
                  ensureWakeLockHeldLocked(appCtx, remainingMs.coerceAtLeast(60_000L))
                }
              }
            }
            // 2. Pulso UDP loopback local (mantém atividade de pacote caso o OEM monitore socket)
            try {
              udpSocket.send(pingPacket)
              udpSocket.receive(recvPacket)
            } catch (_: Throwable) {
              // ignore loopback timeout
            }
          }
        }
      } catch (_: Throwable) {
        // Fallback: se AudioTrack falhar em algum dispositivo atípico, mantém renovação do WakeLock
        while (keepAliveActive && SystemClock.elapsedRealtime() < expireAtElapsedRealtime) {
          try {
            Thread.sleep(4_000L)
          } catch (_: InterruptedException) {
            break
          }
          val remainingMs = expireAtElapsedRealtime - SystemClock.elapsedRealtime()
          if (remainingMs > 0L) {
            synchronized(lock) {
              if (keepAliveActive && wakeLock?.isHeld != true) {
                ensureWakeLockHeldLocked(appCtx, remainingMs.coerceAtLeast(60_000L))
              }
            }
          }
        }
      } finally {
        try {
          udpSocket?.close()
        } catch (_: Throwable) {}
        try {
          track?.stop()
        } catch (_: Throwable) {}
        try {
          track?.release()
        } catch (_: Throwable) {}
        synchronized(lock) {
          if (!keepAliveActive || SystemClock.elapsedRealtime() >= expireAtElapsedRealtime) {
            keepAliveActive = false
            try {
              wakeLock?.let { if (it.isHeld) it.release() }
            } catch (_: Throwable) {}
            wakeLock = null
          }
        }
      }
    }, "busca-facial-keepalive").apply {
      isDaemon = true
      start()
    }
    keepAliveThread = thread
  }

  override fun definition() = ModuleDefinition {
    Name("WakeLock")

    Function("acquire") { timeoutMs: Double ->
      val context = appContext.reactContext ?: return@Function false
      val durationMs = timeoutMs.toLong().coerceAtLeast(60_000L)
      synchronized(lock) {
        expireAtElapsedRealtime = SystemClock.elapsedRealtime() + durationMs
        ensureWakeLockHeldLocked(context, durationMs)
        startKeepAliveThreadIfNeededLocked(context)
      }
      true
    }

    Function("release") {
      val threadToInterrupt: Thread?
      synchronized(lock) {
        keepAliveActive = false
        expireAtElapsedRealtime = 0L
        threadToInterrupt = keepAliveThread
        keepAliveThread = null
        try {
          wakeLock?.let {
            if (it.isHeld) it.release()
          }
        } catch (_: Throwable) {}
        wakeLock = null
      }
      try {
        threadToInterrupt?.interrupt()
      } catch (_: Throwable) {}
      true
    }

    Function("isHeld") {
      synchronized(lock) {
        keepAliveActive || (wakeLock?.isHeld ?: false)
      }
    }

    Function("isIgnoringBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        return@Function true
      }
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      powerManager.isIgnoringBatteryOptimizations(context.packageName)
    }

    @SuppressLint("BatteryLife")
    Function("requestIgnoreBatteryOptimizations") {
      val context = appContext.reactContext ?: return@Function false
      if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) {
        return@Function true
      }
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager
      if (powerManager.isIgnoringBatteryOptimizations(context.packageName)) {
        return@Function true
      }
      return@Function try {
        val intent = Intent(Settings.ACTION_REQUEST_IGNORE_BATTERY_OPTIMIZATIONS).apply {
          data = Uri.parse("package:${context.packageName}")
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        val targetContext = appContext.currentActivity ?: context
        if (appContext.currentActivity != null) {
          intent.flags = intent.flags and Intent.FLAG_ACTIVITY_NEW_TASK.inv()
        }
        targetContext.startActivity(intent)
        true
      } catch (_: Throwable) {
        try {
          val fallback = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(fallback)
          true
        } catch (_: Throwable) {
          false
        }
      }
    }

    Function("openBatteryOptimizationSettings") {
      val context = appContext.reactContext ?: return@Function false
      return@Function try {
        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        true
      } catch (_: Throwable) {
        try {
          val details = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${context.packageName}")
            addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
          }
          context.startActivity(details)
          true
        } catch (_: Throwable) {
          false
        }
      }
    }
  }
}

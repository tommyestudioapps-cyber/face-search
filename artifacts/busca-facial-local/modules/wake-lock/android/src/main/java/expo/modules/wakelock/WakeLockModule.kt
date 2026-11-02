package expo.modules.wakelock

import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.BroadcastReceiver
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.content.Context
import android.content.Intent
import android.content.pm.PackageManager
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

class DeviceWakeReceiver : BroadcastReceiver() {
  companion object {
    const val ACTION_GUARDIAN_REVIVE = "expo.modules.wakelock.ACTION_GUARDIAN_REVIVE"
    const val ACTION_RESUME_INDEXING = "expo.modules.wakelock.ACTION_RESUME_INDEXING"
  }

  override fun onReceive(context: Context, intent: Intent?) {
    val action = intent?.action ?: return
    android.util.Log.i("DeviceWakeReceiver", "[DeviceWake] Evento do sistema recebido: $action")
    if (action == ACTION_RESUME_INDEXING) {
      WakeLockModule.resumeFromNotification(context)
      return
    }
    if (
      action == Intent.ACTION_USER_PRESENT ||
      action == Intent.ACTION_POWER_CONNECTED ||
      action == ACTION_GUARDIAN_REVIVE
    ) {
      WakeLockModule.onDeviceWakeEvent(context, action)
    }
  }
}

/**
 * Roda no processo isolado ":keepalive".
 * Quando o usuário fecha o app nos Recentes, o ColorOS aplica o-kill no PID principal,
 * mas este processo permanece vivo, mantendo a notificação firme na barra de status
 * e religando o processo principal imediatamente sem o buraco de 18 segundos.
 */
class IndexingGuardianService : Service() {
  companion object {
    const val ACTION_START_OR_UPDATE = "expo.modules.wakelock.GUARDIAN_UPDATE"
    const val ACTION_STOP = "expo.modules.wakelock.GUARDIAN_STOP"
    const val EXTRA_PROCESSED = "processed"
    const val EXTRA_TOTAL = "total"
    const val GUARDIAN_CHANNEL_ID = "search-face-indexing-v2"
    const val GUARDIAN_NOTIFICATION_ID = 1000747637

    private const val PREFS_NAME = "indexing_guardian"
    private const val PREF_PROCESSED = "processed"
    private const val PREF_TOTAL = "total"
    private const val PREF_VISIBLE = "visible"

    fun prefs(context: Context): android.content.SharedPreferences =
      context.applicationContext.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

    fun setVisible(context: Context, visible: Boolean) {
      prefs(context).edit().putBoolean(PREF_VISIBLE, visible).apply()
    }
  }

  private var lastProcessed: Int = 0
  private var lastTotal: Int = 0
  private var isStopping: Boolean = false
  private val handler = Handler(Looper.getMainLooper())

  override fun onBind(intent: Intent?): IBinder? = null

  private fun buildProgressNotification(processed: Int, total: Int): Notification {
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      val channel = NotificationChannel(
        GUARDIAN_CHANNEL_ID,
        "Preparação do índice",
        NotificationManager.IMPORTANCE_DEFAULT
      ).apply {
        description = "Progresso da preparação local de busca facial"
        setShowBadge(true)
        enableVibration(false)
        setSound(null, null)
      }
      nm.createNotificationChannel(channel)
    }

    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val piFlags = PendingIntent.FLAG_UPDATE_CURRENT or
      (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
    val pendingIntent = launch?.let { PendingIntent.getActivity(this, 0, it, piFlags) }

    val pct = if (total > 0) ((processed.coerceAtMost(total) * 100) / total) else 0
    val body = if (total > 0) {
      "Progresso: $pct% concluído ($processed/$total)"
    } else {
      "Preparando fotos da galeria em segundo plano..."
    }

    val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
      Notification.Builder(this, GUARDIAN_CHANNEL_ID)
    } else {
      @Suppress("DEPRECATION")
      Notification.Builder(this)
    }

    val appIcon = applicationInfo.icon.takeIf { it != 0 }
    val customIcon = resources.getIdentifier("ic_notification", "drawable", packageName)
    val icon = if (customIcon != 0) customIcon else (appIcon ?: android.R.drawable.stat_notify_sync)
    builder
      .setSmallIcon(icon)
      .setContentTitle("Criando catálogo local")
      .setContentText(body)
      .setProgress(100, pct, total <= 0)
      .setOngoing(true)
      .setOnlyAlertOnce(true)

    if (pendingIntent != null) {
      builder.setContentIntent(pendingIntent)
    }
    return builder.build()
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val action = intent?.action
    if (action == ACTION_STOP) {
      prefs(this).edit().putBoolean(PREF_VISIBLE, false).apply()
      isStopping = true
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.N) {
          stopForeground(STOP_FOREGROUND_REMOVE)
        } else {
          @Suppress("DEPRECATION")
          stopForeground(true)
        }
      } catch (_: Throwable) {}
      stopSelf()
      return START_NOT_STICKY
    }

    isStopping = false
    if (intent != null && intent.hasExtra(EXTRA_PROCESSED)) {
      lastProcessed = intent.getIntExtra(EXTRA_PROCESSED, lastProcessed)
      lastTotal = intent.getIntExtra(EXTRA_TOTAL, lastTotal)
    }

    prefs(this).edit()
      .putInt(PREF_PROCESSED, lastProcessed)
      .putInt(PREF_TOTAL, lastTotal)
      .apply()

    val shouldShowCard = prefs(this).getBoolean(PREF_VISIBLE, false)
    if (!shouldShowCard) {
      // Dono do card é o notifee no processo principal. O Guardião só anota.
      stopSelf(startId)
      return START_NOT_STICKY
    }

    try {
      val notification = buildProgressNotification(lastProcessed, lastTotal)
      if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
        startForeground(
          GUARDIAN_NOTIFICATION_ID,
          notification,
          android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
        )
      } else {
        startForeground(GUARDIAN_NOTIFICATION_ID, notification)
      }
    } catch (t: Throwable) {
      android.util.Log.w("IndexingGuardian", "Falha em startForeground no guardiao", t)
    }

    return START_STICKY
  }

  override fun onTaskRemoved(rootIntent: Intent?) {
    super.onTaskRemoved(rootIntent)
    if (isStopping) return
    android.util.Log.w("IndexingGuardian", "[Guardian] Swipe nos Recentes detectado! Blindando notificacao e acordando processo principal...")
    try {
      val storedPrefs = prefs(this)
      lastProcessed = storedPrefs.getInt(PREF_PROCESSED, lastProcessed)
      lastTotal = storedPrefs.getInt(PREF_TOTAL, lastTotal)
      storedPrefs.edit().putBoolean(PREF_VISIBLE, true).apply()
      try {
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.Q) {
          startForeground(
            GUARDIAN_NOTIFICATION_ID,
            buildProgressNotification(lastProcessed, lastTotal),
            android.content.pm.ServiceInfo.FOREGROUND_SERVICE_TYPE_DATA_SYNC
          )
        } else {
          startForeground(GUARDIAN_NOTIFICATION_ID, buildProgressNotification(lastProcessed, lastTotal))
        }
      } catch (t: Throwable) {
        android.util.Log.w("IndexingGuardian", "[Guardian] Falha ao assumir card no swipe", t)
      }

      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      nm.notify(GUARDIAN_NOTIFICATION_ID, buildProgressNotification(lastProcessed, lastTotal))

      // Reafirma em 100ms e 350ms (logo após o o-kill matar o PID principal) e acorda o processo principal via Broadcast
      try {
        // HeadlessJsTaskService NÃO é um foreground service: usar startService.
        val headless = Intent(this, IndexingHeadlessService::class.java)
        startService(headless)
        android.util.Log.i("IndexingGuardian", "[Guardian] Headless task solicitado")
      } catch (t: Throwable) {
        android.util.Log.w("IndexingGuardian", "[Guardian] Falha ao iniciar headless", t)
      }

      handler.postDelayed({
        if (!isStopping) {
          try {
            startForeground(GUARDIAN_NOTIFICATION_ID, buildProgressNotification(lastProcessed, lastTotal))
          } catch (_: Throwable) {
            nm.notify(GUARDIAN_NOTIFICATION_ID, buildProgressNotification(lastProcessed, lastTotal))
          }
        }
      }, 100L)

      handler.postDelayed({
        if (!isStopping) {
          try {
            nm.notify(GUARDIAN_NOTIFICATION_ID, buildProgressNotification(lastProcessed, lastTotal))
            val wakeIntent = Intent(this, DeviceWakeReceiver::class.java).apply {
              action = DeviceWakeReceiver.ACTION_GUARDIAN_REVIVE
              setPackage(packageName)
            }
            sendBroadcast(wakeIntent)
          } catch (e: Throwable) {
            android.util.Log.w("IndexingGuardian", "[Guardian] Falha ao enviar broadcast de revive", e)
          }
        }
      }, 350L)
    } catch (t: Throwable) {
      android.util.Log.w("IndexingGuardian", "[Guardian] Erro em onTaskRemoved", t)
    }
  }
}

class WakeLockModule : Module() {
  companion object {
    @Volatile
    @JvmStatic
    var keepAliveActive: Boolean = false

    @JvmStatic
    fun isKeepAliveActive(): Boolean = keepAliveActive

    @Volatile
    @JvmStatic
    var instance: WakeLockModule? = null

    private const val REVIVAL_CHANNEL_ID = "search-face-indexing-alive"
    private const val REVIVAL_NOTIFICATION_ID = 424242

    @JvmStatic
    fun resumeFromNotification(context: Context) {
      // Isenção "ação do usuário na notificação": aqui o app está temporariamente
      // liberado para iniciar serviços, mesmo sem Activity visível.
      try {
        // 1. O Guardião passa a ser o dono do card (com os contadores persistidos).
        IndexingGuardianService.setVisible(context, true)
        val guardian = Intent(context, IndexingGuardianService::class.java).apply {
          action = IndexingGuardianService.ACTION_START_OR_UPDATE
        }
        context.startService(guardian)

        // 2. O lote roda sem Activity.
        val headless = Intent(context, IndexingHeadlessService::class.java)
        context.startService(headless)

        android.util.Log.i("DeviceWakeReceiver", "[DeviceWake] Retomada solicitada pelo toque")
      } catch (t: Throwable) {
        android.util.Log.w("DeviceWakeReceiver", "[DeviceWake] Falha ao retomar pelo toque", t)
      }
    }

    @JvmStatic
    fun clearRevivalNotification(context: Context) {
      try {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.cancel(REVIVAL_NOTIFICATION_ID)
      } catch (_: Throwable) {
      }
    }

    @JvmStatic
    fun isGuardianNotificationVisible(context: Context): Boolean {
      return try {
        if (Build.VERSION.SDK_INT < Build.VERSION_CODES.M) return false
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        nm.activeNotifications.any { it.id == IndexingGuardianService.GUARDIAN_NOTIFICATION_ID }
      } catch (t: Throwable) {
        android.util.Log.w("DeviceWakeReceiver", "[DeviceWake] Falha ao consultar notificações ativas", t)
        false
      }
    }

    @JvmStatic
    fun postRevivalNotification(context: Context) {
      try {
        val nm = context.getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          val channel = NotificationChannel(
            REVIVAL_CHANNEL_ID,
            "Catálogo local",
            NotificationManager.IMPORTANCE_DEFAULT
          )
          channel.description = "Aviso de catálogo pendente"
          channel.setShowBadge(true)
          nm.createNotificationChannel(channel)
        }
        val resumeIntent = Intent(context, DeviceWakeReceiver::class.java).apply {
          action = DeviceWakeReceiver.ACTION_RESUME_INDEXING
          setPackage(context.packageName)
        }
        val piFlags = PendingIntent.FLAG_UPDATE_CURRENT or
          (if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.M) PendingIntent.FLAG_IMMUTABLE else 0)
        val builder = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          Notification.Builder(context, REVIVAL_CHANNEL_ID)
        } else {
          @Suppress("DEPRECATION")
          Notification.Builder(context)
        }
        val notifIcon = context.resources.getIdentifier("ic_notification", "drawable", context.packageName).takeIf { it != 0 }
        val icon = notifIcon ?: context.applicationInfo.icon.takeIf { it != 0 }
          ?: android.R.drawable.stat_notify_sync
        builder
          .setSmallIcon(icon)
          .setContentTitle("Preparação pausada")
          .setContentText("Toque para retomar a preparação do índice.")
          .setOngoing(true)
          .setOnlyAlertOnce(true)
        builder.setContentIntent(
          PendingIntent.getBroadcast(context, 1, resumeIntent, piFlags)
        )
        if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.O) {
          builder.setChannelId(REVIVAL_CHANNEL_ID)
        } else {
          @Suppress("DEPRECATION")
          builder.setPriority(Notification.PRIORITY_DEFAULT)
        }
        nm.notify(REVIVAL_NOTIFICATION_ID, builder.build())
      } catch (t: Throwable) {
        android.util.Log.w("DeviceWakeReceiver", "[DeviceWake] Falha ao postar notificação de retomada", t)
      }
    }

    @JvmStatic
    fun onDeviceWakeEvent(context: Context, action: String) {
      try {
        val appCtx = context.applicationContext
        val hasPerm = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
          appCtx.checkSelfPermission(android.Manifest.permission.READ_MEDIA_IMAGES) == PackageManager.PERMISSION_GRANTED
        } else {
          appCtx.checkSelfPermission(android.Manifest.permission.READ_EXTERNAL_STORAGE) == PackageManager.PERMISSION_GRANTED
        }
        if (!hasPerm) {
          android.util.Log.w("DeviceWakeReceiver", "[DeviceWake] Ignorado: sem permissao de galeria")
          return
        }

        android.util.Log.i("DeviceWakeReceiver", "[DeviceWake] Permissao confirmada. Acordando CPU e notificando JS...")

        // 1. Garante PARTIAL_WAKE_LOCK de 60s para manter a CPU acordada enquanto o lote roda
        val powerManager = appCtx.getSystemService(Context.POWER_SERVICE) as PowerManager
        val wl = powerManager.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "busca-facial-local:device-wake")
        wl.acquire(60_000L)

        val current = instance
        if (current != null) {
          try {
            current.sendEvent("onDeviceWake", mapOf("action" to action))
            clearRevivalNotification(appCtx)
          } catch (t: Throwable) {
            android.util.Log.w("DeviceWakeReceiver", "[DeviceWake] Falha ao enviar evento para JS", t)
          }
        }

        // Dono único do card é o Guardião. A notificação de retomada só entra
        // quando não há NENHUM card na barra — nunca por suposição.
        if (!isGuardianNotificationVisible(appCtx)) {
          android.util.Log.i("DeviceWakeReceiver", "[DeviceWake] Sem card ativo; postando notificação de retomada")
          postRevivalNotification(appCtx)
        } else {
          android.util.Log.i("DeviceWakeReceiver", "[DeviceWake] Guardião já exibe card; nada a postar")
        }
      } catch (t: Throwable) {
        android.util.Log.w("DeviceWakeReceiver", "[DeviceWake] Erro ao tratar evento de wake", t)
      }
    }
  }

  private val lock = Any()
  private var wakeLock: PowerManager.WakeLock? = null
  private var keepAliveThread: Thread? = null

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

    Events("onDeviceWake")

    OnCreate {
      instance = this@WakeLockModule
    }

    OnDestroy {
      if (instance === this@WakeLockModule) {
        instance = null
      }
    }

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

    Function("clearRevivalNotification") {
      try {
        val ctx = appContext.reactContext?.applicationContext
        if (ctx != null) clearRevivalNotification(ctx)
        true
      } catch (_: Throwable) {
        false
      }
    }

    Function("syncGuardianProgress") { processed: Double, total: Double ->
      try {
        val ctx = appContext.reactContext?.applicationContext ?: return@Function false
        val intent = Intent(ctx, IndexingGuardianService::class.java).apply {
          action = IndexingGuardianService.ACTION_START_OR_UPDATE
          putExtra(IndexingGuardianService.EXTRA_PROCESSED, processed.toInt())
          putExtra(IndexingGuardianService.EXTRA_TOTAL, total.toInt())
        }
        ctx.startService(intent)
        true
      } catch (t: Throwable) {
        android.util.Log.w("WakeLockModule", "Falha ao sincronizar IndexingGuardianService", t)
        false
      }
    }

    Function("stopGuardian") {
      try {
        val ctx = appContext.reactContext?.applicationContext ?: return@Function false
        val intent = Intent(ctx, IndexingGuardianService::class.java).apply {
          action = IndexingGuardianService.ACTION_STOP
        }
        ctx.startService(intent)
        true
      } catch (_: Throwable) {
        false
      }
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
        val intent = Intent(Settings.ACTION_IGNORE_BATTERY_OPTIMIZATION_SETTINGS).apply {
          addFlags(Intent.FLAG_ACTIVITY_NEW_TASK)
        }
        context.startActivity(intent)
        true
      } catch (_: Throwable) {
        try {
          val fallback = Intent(Settings.ACTION_APPLICATION_DETAILS_SETTINGS).apply {
            data = Uri.parse("package:${context.packageName}")
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

    Function("hasFullGalleryPermission") {
      val context = appContext.reactContext ?: return@Function false
      val appCtx = context.applicationContext
      return@Function if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        appCtx.checkSelfPermission(
          android.Manifest.permission.READ_MEDIA_IMAGES
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
      } else {
        appCtx.checkSelfPermission(
          android.Manifest.permission.READ_EXTERNAL_STORAGE
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
      }
    }

    Function("hasAnyGalleryPermission") {
      val context = appContext.reactContext ?: return@Function false
      val appCtx = context.applicationContext
      return@Function if (Build.VERSION.SDK_INT >= 34) {
        val full = appCtx.checkSelfPermission(
          android.Manifest.permission.READ_MEDIA_IMAGES
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        val partial = appCtx.checkSelfPermission(
          "android.permission.READ_MEDIA_VISUAL_USER_SELECTED"
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
        full || partial
      } else if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.TIRAMISU) {
        appCtx.checkSelfPermission(
          android.Manifest.permission.READ_MEDIA_IMAGES
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
      } else {
        appCtx.checkSelfPermission(
          android.Manifest.permission.READ_EXTERNAL_STORAGE
        ) == android.content.pm.PackageManager.PERMISSION_GRANTED
      }
    }
  }
}

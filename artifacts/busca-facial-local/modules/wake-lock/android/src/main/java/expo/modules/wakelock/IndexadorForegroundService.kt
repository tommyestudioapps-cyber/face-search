package expo.modules.wakelock

import android.app.Activity
import android.app.Application
import android.app.Notification
import android.app.NotificationChannel
import android.app.NotificationManager
import android.app.PendingIntent
import android.app.Service
import android.content.Context
import android.content.Intent
import android.content.pm.ServiceInfo
import android.os.Build
import android.os.Bundle
import android.os.Handler
import android.os.IBinder
import android.os.Looper
import android.os.PowerManager
import androidx.core.app.NotificationCompat
import androidx.core.app.ServiceCompat

class IndexadorForegroundService : Service() {

  companion object {
    const val ACTION_START = "expo.modules.wakelock.INDEXER_START"
    const val ACTION_PAUSE = "expo.modules.wakelock.INDEXER_PAUSE"
    const val ACTION_STOP = "expo.modules.wakelock.INDEXER_STOP"
    const val ACTION_UPDATE_PROGRESS = "expo.modules.wakelock.INDEXER_PROGRESS"
    const val ACTION_HEADLESS_DONE = "expo.modules.wakelock.INDEXER_HEADLESS_DONE"

    const val EXTRA_PROCESSED = "processed"
    const val EXTRA_TOTAL = "total"

    private const val CHANNEL_ID = "search-face-indexing-v2"
    private const val NOTIFICATION_ID = 1000747637
    private const val PREFS_NAME = "indexador_prefs"
    private const val KEY_PAUSED = "is_paused"
    private const val KEY_PROCESSED = "processed_count"
    private const val KEY_TOTAL = "total_count"

    private const val WATCHDOG_INTERVAL_MS = 5 * 60 * 1000L
    private const val MAX_RETRIES = 3

    @Volatile
    var isRunning: Boolean = false
      private set

    @JvmStatic
    fun isPauseRequested(context: Context): Boolean =
      context.getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE).getBoolean(KEY_PAUSED, false)
  }

  private var wakeLock: PowerManager.WakeLock? = null
  private var appInForeground = false
  private var isHeadlessRunning = false
  private var retries = 0
  private var lastProcessed = -1
  private var lastProgressAt = 0L

  private val handler = Handler(Looper.getMainLooper())
  private val watchdog = object : Runnable {
    override fun run() {
      if (isHeadlessRunning && lastProcessed >= 0 &&
        System.currentTimeMillis() - lastProgressAt >= WATCHDOG_INTERVAL_MS
      ) {
        isHeadlessRunning = false
        stopService(Intent(this@IndexadorForegroundService, IndexingHeadlessService::class.java))
        if (retries < MAX_RETRIES) {
          retries++
          if (!appInForeground) startHeadless()
        } else {
          prefs().edit().putBoolean(KEY_PAUSED, true).apply()
          retries = 0
        }
      }
      handler.postDelayed(this, WATCHDOG_INTERVAL_MS)
    }
  }

  private fun prefs() = getSharedPreferences(PREFS_NAME, Context.MODE_PRIVATE)

  override fun onCreate() {
    super.onCreate()
    isRunning = true
    createChannel()
    acquireWakeLock()
    appInForeground = isAppVisible()
    application.registerActivityLifecycleCallbacks(lifecycleWatcher)
    handler.postDelayed(watchdog, WATCHDOG_INTERVAL_MS)
  }

  private val lifecycleWatcher = object : Application.ActivityLifecycleCallbacks {
    override fun onActivityStarted(activity: Activity) {
      appInForeground = true
      stopHeadless()
    }
    override fun onActivityStopped(activity: Activity) {
      appInForeground = isAppVisible()
      if (!appInForeground) maybeStartHeadless()
    }
    override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {}
    override fun onActivityResumed(activity: Activity) {}
    override fun onActivityPaused(activity: Activity) {}
    override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}
    override fun onActivityDestroyed(activity: Activity) {}
  }

  private fun isAppVisible(): Boolean {
    val am = getSystemService(Context.ACTIVITY_SERVICE) as android.app.ActivityManager
    @Suppress("DEPRECATION")
    val procs = am.runningAppProcesses ?: return false
    return procs.any {
      it.processName == packageName &&
        it.importance == android.app.ActivityManager.RunningAppProcessInfo.IMPORTANCE_FOREGROUND
    }
  }

  override fun onStartCommand(intent: Intent?, flags: Int, startId: Int): Int {
    val p = prefs()
    val processed = intent?.getIntExtra(EXTRA_PROCESSED, -1)?.takeIf { it >= 0 } ?: p.getInt(KEY_PROCESSED, 0)
    val total = intent?.getIntExtra(EXTRA_TOTAL, -1)?.takeIf { it > 0 } ?: p.getInt(KEY_TOTAL, 5400)
    p.edit().putInt(KEY_PROCESSED, processed).putInt(KEY_TOTAL, total).apply()

    val paused = p.getBoolean(KEY_PAUSED, false)

    // Obrigatório em TODO caminho, inclusive intent == null (reinício START_STICKY).
    // specialUse: sem cota do dataSync, sem onTimeout, logo sem FGS Crashed.
    val fgsType = if (Build.VERSION.SDK_INT >= Build.VERSION_CODES.UPSIDE_DOWN_CAKE) {
      ServiceInfo.FOREGROUND_SERVICE_TYPE_SPECIAL_USE
    } else {
      0
    }
    try {
      ServiceCompat.startForeground(
        this,
        NOTIFICATION_ID,
        buildNotification(processed, total, paused, false),
        fgsType,
      )
      android.util.Log.i("Indexador", "[Indexer] FGS ativo type=specialUse")
    } catch (t: Throwable) {
      android.util.Log.w(
        "Indexador",
        "[Indexer] FGS negado: ${t.javaClass.simpleName} - ${t.message}",
      )
    }

    when (intent?.action) {
      ACTION_START -> {
        p.edit().putBoolean(KEY_PAUSED, false).apply()
        retries = 0
        maybeStartHeadless()
      }
      ACTION_UPDATE_PROGRESS -> {
        retries = 0
        lastProcessed = processed
        lastProgressAt = System.currentTimeMillis()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
          .notify(NOTIFICATION_ID, buildNotification(processed, total, paused, false))
      }
      ACTION_PAUSE -> {
        p.edit().putBoolean(KEY_PAUSED, true).apply()
        (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager)
          .notify(NOTIFICATION_ID, buildNotification(processed, total, true, false))
      }
      ACTION_HEADLESS_DONE -> {
        isHeadlessRunning = false
      }
      ACTION_STOP -> stopGracefully(processed, total)
      null -> maybeStartHeadless()
    }

    return START_STICKY
  }

  private fun stopGracefully(processed: Int, total: Int) {
    stopService(Intent(this, IndexingHeadlessService::class.java))
    isHeadlessRunning = false
    releaseWakeLock()

    if (prefs().getBoolean(KEY_PAUSED, false)) {
      // Pausa: sai do FGS, mantém um card comum e encerra o serviço.
      val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_DETACH)
      nm.notify(NOTIFICATION_ID, buildNotification(processed, total, true, true))
      stopSelf()
    } else {
      ServiceCompat.stopForeground(this, ServiceCompat.STOP_FOREGROUND_REMOVE)
      (getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager).cancel(NOTIFICATION_ID)
      prefs().edit().putBoolean(KEY_PAUSED, false).putInt(KEY_PROCESSED, 0).apply()
      stopSelf()
    }
  }

  private fun maybeStartHeadless() {
    if (appInForeground) return
    if (prefs().getBoolean(KEY_PAUSED, false)) return
    if (isHeadlessRunning) return
    startHeadless()
  }

  private fun startHeadless() {
    try {
      isHeadlessRunning = true
      lastProgressAt = System.currentTimeMillis()
      startService(Intent(this, IndexingHeadlessService::class.java))
      android.util.Log.i("Indexador", "[Indexer] headless despachado")
    } catch (t: Throwable) {
      isHeadlessRunning = false
      android.util.Log.w("Indexador", "[Indexer] falha ao despachar headless", t)
    }
  }

  private fun stopHeadless() {
    if (!isHeadlessRunning) return
    stopService(Intent(this, IndexingHeadlessService::class.java))
    isHeadlessRunning = false
  }

  private fun buildNotification(processed: Int, total: Int, paused: Boolean, plain: Boolean): Notification {
    val launch = packageManager.getLaunchIntentForPackage(packageName)
    val content = PendingIntent.getActivity(
      this, 0, launch, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
    )

    val builder = NotificationCompat.Builder(this, CHANNEL_ID)
      .setSmallIcon(android.R.drawable.stat_notify_sync)
      .setContentTitle(if (paused) "Indexação pausada" else "Criando catálogo local")
      .setContentText(
        if (paused) "Progresso congelado em $processed/$total arquivos."
        else "Processando $processed de $total arquivos...",
      )
      .setProgress(total, processed, false)
      .setContentIntent(content)
      .setOnlyAlertOnce(true)
      .setOngoing(!plain)
      .setPriority(NotificationCompat.PRIORITY_DEFAULT)

    if (!paused && !plain) {
      val pauseIntent = Intent(this, IndexadorForegroundService::class.java).apply { action = ACTION_PAUSE }
      builder.addAction(
        android.R.drawable.ic_media_pause,
        "Pausar",
        PendingIntent.getService(
          this, 1, pauseIntent, PendingIntent.FLAG_UPDATE_CURRENT or PendingIntent.FLAG_IMMUTABLE,
        ),
      )
    }

    return builder.build()
  }

  private fun createChannel() {
    if (Build.VERSION.SDK_INT < Build.VERSION_CODES.O) return
    val nm = getSystemService(Context.NOTIFICATION_SERVICE) as NotificationManager
    val channel = NotificationChannel(CHANNEL_ID, "Preparação do índice", NotificationManager.IMPORTANCE_DEFAULT)
    channel.description = "Progresso da preparação automática do índice local."
    channel.setSound(null, null)
    nm.createNotificationChannel(channel)
  }

  private fun acquireWakeLock() {
    if (wakeLock?.isHeld == true) return
    val pm = getSystemService(Context.POWER_SERVICE) as PowerManager
    wakeLock = pm.newWakeLock(PowerManager.PARTIAL_WAKE_LOCK, "busca-facial-local:indexer").apply {
      setReferenceCounted(false)
      acquire(6 * 60 * 60 * 1000L)
    }
  }

  private fun releaseWakeLock() {
    try {
      if (wakeLock?.isHeld == true) wakeLock?.release()
    } catch (_: Throwable) {
    }
    wakeLock = null
  }

  override fun onDestroy() {
    isRunning = false
    handler.removeCallbacks(watchdog)
    application.unregisterActivityLifecycleCallbacks(lifecycleWatcher)
    releaseWakeLock()
    super.onDestroy()
  }

  override fun onBind(intent: Intent?): IBinder? = null
}

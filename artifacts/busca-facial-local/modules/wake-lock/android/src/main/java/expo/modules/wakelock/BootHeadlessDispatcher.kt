package expo.modules.wakelock

import android.app.Activity
import android.app.Application
import android.content.Intent
import android.os.Bundle
import android.os.Handler
import android.os.Looper
import android.util.Log

/**
 * Se o processo nascer sem Activity (ex.: serviço do Notifee reiniciado após swipe),
 * despacha o IndexingHeadlessService. É esse despacho que liga isRunningTasks no
 * JavaTimerManager e permite que os timers do JS voltem a rodar.
 */
object BootHeadlessDispatcher {
  private const val TAG = "BootHeadless"
  private const val DISPATCH_DELAY_MS = 5_000L

  @Volatile
  private var activitySeen = false

  @Volatile
  private var registered = false

  @JvmStatic
  fun schedule(application: Application) {
    if (registered) return
    registered = true

    application.registerActivityLifecycleCallbacks(
      object : Application.ActivityLifecycleCallbacks {
        override fun onActivityCreated(activity: Activity, savedInstanceState: Bundle?) {
          activitySeen = true
        }

        override fun onActivityStarted(activity: Activity) {
          activitySeen = true
        }

        override fun onActivityResumed(activity: Activity) {
          activitySeen = true
        }

        override fun onActivityPaused(activity: Activity) {}

        override fun onActivityStopped(activity: Activity) {}

        override fun onActivitySaveInstanceState(activity: Activity, outState: Bundle) {}

        override fun onActivityDestroyed(activity: Activity) {}
      },
    )

    Handler(Looper.getMainLooper()).postDelayed({
      if (activitySeen) {
        Log.i(TAG, "[Boot] Activity presente; headless não é necessário")
        return@postDelayed
      }
      try {
        val ctx = application.applicationContext
        ctx.startService(Intent(ctx, IndexingHeadlessService::class.java))
        Log.i(TAG, "[Boot] sem Activity; IndexingHeadlessService despachado")
      } catch (t: Throwable) {
        Log.w(TAG, "[Boot] Falha ao despachar headless", t)
      }
    }, DISPATCH_DELAY_MS)
  }
}

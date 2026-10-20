package expo.modules.wakelock

import android.annotation.SuppressLint
import android.content.Context
import android.content.Intent
import android.net.Uri
import android.os.Build
import android.os.PowerManager
import android.provider.Settings
import expo.modules.kotlin.modules.Module
import expo.modules.kotlin.modules.ModuleDefinition

class WakeLockModule : Module() {
  private var wakeLock: PowerManager.WakeLock? = null

  override fun definition() = ModuleDefinition {
    Name("WakeLock")

    Function("acquire") { timeoutMs: Double ->
      val context = appContext.reactContext ?: return@Function false
      val powerManager = context.getSystemService(Context.POWER_SERVICE) as PowerManager

      wakeLock?.let {
        if (it.isHeld) it.release()
      }

      wakeLock = powerManager.newWakeLock(
        PowerManager.PARTIAL_WAKE_LOCK,
        "busca-facial-local:indexing"
      ).apply {
        setReferenceCounted(false)
        acquire(timeoutMs.toLong())
      }

      true
    }

    Function("release") {
      wakeLock?.let {
        if (it.isHeld) it.release()
      }
      wakeLock = null
      true
    }

    Function("isHeld") {
      wakeLock?.isHeld ?: false
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

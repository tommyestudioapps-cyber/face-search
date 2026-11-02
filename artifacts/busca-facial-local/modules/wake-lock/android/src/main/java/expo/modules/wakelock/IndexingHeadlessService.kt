package expo.modules.wakelock

import android.content.Intent
import com.facebook.react.HeadlessJsTaskService
import com.facebook.react.jstasks.HeadlessJsTaskConfig

class IndexingHeadlessService : HeadlessJsTaskService() {
  override fun getTaskConfig(intent: Intent?): HeadlessJsTaskConfig {
    return HeadlessJsTaskConfig(
      "IndexingBatch",
      com.facebook.react.bridge.Arguments.createMap(),
      120_000L,
      true
    )
  }
}

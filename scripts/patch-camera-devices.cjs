const fs = require('fs');
const path = require('path');

function findFiles(dir, targetName, out = []) {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (entry.name !== '.git') {
          findFiles(fullPath, targetName, out);
        }
      } else if (entry.name === targetName) {
        out.push(fullPath);
      }
    }
  } catch (_) {}
  return out;
}

const rootDir = path.resolve(__dirname, '..');
const matches = findFiles(path.join(rootDir, 'node_modules'), 'CameraDevicesManager.kt');
console.log(`[patch-camera-devices] Found ${matches.length} target file(s):`, matches);

let patchedCount = 0;
for (const file of matches) {
  let content = fs.readFileSync(file, 'utf8');
  const isCrlf = content.includes('\r\n');
  let normalized = content.replace(/\r\n/g, '\n');
  let modified = false;

  // Clean any previously corrupted replacement if present (extra brace)
  if (normalized.includes('init {\n    // Eager initialization disabled to prevent cold-start crashes/NoClassDefFoundError on Android 9+\n  }\n  }')) {
    normalized = normalized.replace(
      'init {\n    // Eager initialization disabled to prevent cold-start crashes/NoClassDefFoundError on Android 9+\n  }\n  }',
      'init {\n    // Eager initialization disabled to prevent cold-start crashes/NoClassDefFoundError on Android 9+\n  }'
    );
    modified = true;
  }

  // Target 1: Init block with eager ExtensionsManager
  const targetInit = `  // Init cameraProvider + manager as early as possible\n  init {\n    coroutineScope.launch {\n      try {\n        Log.i(TAG, "Initializing ProcessCameraProvider...")\n        cameraProvider = ProcessCameraProvider.getInstance(reactContext).await(executor)\n        Log.i(TAG, "Initializing ExtensionsManager...")\n        extensionsManager = ExtensionsManager.getInstanceAsync(reactContext, cameraProvider!!).await(executor)\n        Log.i(TAG, "Successfully initialized!")\n      } catch (error: Throwable) {\n        Log.e(TAG, "Failed to initialize ProcessCameraProvider/ExtensionsManager! Error: \${error.message}", error)\n      }\n    }\n  }`;
  const replaceInit = `  // Init cameraProvider + manager as early as possible\n  init {\n    // Eager initialization disabled to prevent cold-start crashes/NoClassDefFoundError on Android 9+\n  }`;

  if (normalized.includes(targetInit)) {
    normalized = normalized.replace(targetInit, replaceInit);
    modified = true;
  }

  // Target 2: Initialize callback registration without immediate emit
  const targetInitialize = `  override fun initialize() {\n    super.initialize()\n    cameraManager.registerAvailabilityCallback(callback, null)\n    sendAvailableDevicesChangedEvent()\n  }`;
  const replaceInitialize = `  override fun initialize() {\n    super.initialize()\n    try {\n      cameraManager.registerAvailabilityCallback(callback, null)\n    } catch (_: Throwable) {}\n  }`;

  if (normalized.includes(targetInitialize)) {
    normalized = normalized.replace(targetInitialize, replaceInitialize);
    modified = true;
  }

  // Target 3: Invalidate with try/catch
  const targetInvalidate = `  override fun invalidate() {\n    cameraManager.unregisterAvailabilityCallback(callback)\n    super.invalidate()\n  }`;
  const replaceInvalidate = `  override fun invalidate() {\n    try {\n      cameraManager.unregisterAvailabilityCallback(callback)\n    } catch (_: Throwable) {}\n    super.invalidate()\n  }`;

  if (normalized.includes(targetInvalidate)) {
    normalized = normalized.replace(targetInvalidate, replaceInvalidate);
    modified = true;
  }

  // Target 4: Send event with hasActiveReactInstance and try/catch
  const targetSendEvent = `  fun sendAvailableDevicesChangedEvent() {\n    val eventEmitter = reactContext.getJSModule(RCTDeviceEventEmitter::class.java)\n    val devices = getDevicesJson()\n    eventEmitter.emit("CameraDevicesChanged", devices)\n  }`;
  const replaceSendEvent = `  fun sendAvailableDevicesChangedEvent() {\n    try {\n      if (!reactContext.hasActiveReactInstance()) return\n      val eventEmitter = reactContext.getJSModule(RCTDeviceEventEmitter::class.java)\n      val devices = getDevicesJson()\n      eventEmitter.emit("CameraDevicesChanged", devices)\n    } catch (_: Throwable) {}\n  }`;

  if (normalized.includes(targetSendEvent)) {
    normalized = normalized.replace(targetSendEvent, replaceSendEvent);
    modified = true;
  }

  if (modified) {
    const finalContent = isCrlf ? normalized.replace(/\n/g, '\r\n') : normalized;
    fs.writeFileSync(file, finalContent, 'utf8');
    patchedCount++;
    console.log(`[patch-camera-devices] Successfully patched: ${file}`);
  } else {
    console.log(`[patch-camera-devices] Up-to-date or already patched: ${file}`);
  }
}

console.log(`[patch-camera-devices] Completed. ${patchedCount} file(s) updated.`);

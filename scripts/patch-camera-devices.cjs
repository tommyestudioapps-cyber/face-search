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
  let modified = false;

  // 1. Desativa inicializacao avida do ExtensionsManager no init
  if (content.includes('coroutineScope.launch')) {
    content = content.replace(
      /init\s*\{[\s\S]*?coroutineScope\.launch[\s\S]*?\}\s*\}/,
      'init {\n    // Eager initialization disabled to prevent cold-start crashes/NoClassDefFoundError on Android 9+\n  }'
    );
    modified = true;
  }

  // 2. Protege sendAvailableDevicesChangedEvent com hasActiveReactInstance e try/catch
  if (!content.includes('hasActiveReactInstance')) {
    content = content.replace(
      /fun sendAvailableDevicesChangedEvent\(\)\s*\{[\s\S]*?eventEmitter\.emit\("CameraDevicesChanged", devices\)[\s\S]*?\}/,
      'fun sendAvailableDevicesChangedEvent() {\n    try {\n      if (!reactContext.hasActiveReactInstance()) return\n      val eventEmitter = reactContext.getJSModule(RCTDeviceEventEmitter::class.java)\n      val devices = getDevicesJson()\n      eventEmitter.emit("CameraDevicesChanged", devices)\n    } catch (_: Throwable) {}\n  }'
    );
    modified = true;
  }

  // 3. Protege o registro de callback do initialize
  if (content.includes('cameraManager.registerAvailabilityCallback(callback, null)\n    sendAvailableDevicesChangedEvent()')) {
    content = content.replace(
      /cameraManager\.registerAvailabilityCallback\(callback,\s*null\)\s*\n\s*sendAvailableDevicesChangedEvent\(\)/,
      'try {\n      cameraManager.registerAvailabilityCallback(callback, null)\n    } catch (_: Throwable) {}'
    );
    modified = true;
  }

  if (modified) {
    fs.writeFileSync(file, content, 'utf8');
    patchedCount++;
    console.log(`[patch-camera-devices] Successfully patched: ${file}`);
  } else {
    console.log(`[patch-camera-devices] Already patched: ${file}`);
  }
}

console.log(`[patch-camera-devices] Completed. ${patchedCount} file(s) updated.`);

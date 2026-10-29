/**
 * Neutraliza a injeção C++ Codegen do react-native-google-mobile-ads
 * e força a compilação do AdMob em modo isolado (oldarch / interop),
 * evitando símbolos com defeito em libappmodules.so e prevenindo o crash SIGSEGV no boot.
 */
const fs = require('fs');
const path = require('path');

function findAdMobDirs() {
  const dirs = new Set();

  // Tentativa 1: Resolução de módulo via Node
  const searchBases = [
    path.resolve(__dirname, '../artifacts/busca-facial-local'),
    path.resolve(__dirname, '..'),
    process.cwd()
  ];

  for (const base of searchBases) {
    try {
      const resolved = require.resolve('react-native-google-mobile-ads/package.json', { paths: [base] });
      dirs.add(path.dirname(fs.realpathSync(resolved)));
    } catch (e) {}
  }

  // Tentativa 2: Busca por caminhos conhecidos em node_modules / .pnpm
  const directPaths = [
    path.resolve(__dirname, '../artifacts/busca-facial-local/node_modules/react-native-google-mobile-ads'),
    path.resolve(__dirname, '../node_modules/react-native-google-mobile-ads'),
  ];
  for (const p of directPaths) {
    if (fs.existsSync(p)) {
      dirs.add(fs.realpathSync(p));
    }
  }

  // Tentativa 3: Varrer pastas .pnpm caso exista
  const pnpmDir = path.resolve(__dirname, '../node_modules/.pnpm');
  if (fs.existsSync(pnpmDir)) {
    try {
      const entries = fs.readdirSync(pnpmDir);
      for (const entry of entries) {
        if (entry.startsWith('react-native-google-mobile-ads@')) {
          const target = path.join(pnpmDir, entry, 'node_modules/react-native-google-mobile-ads');
          if (fs.existsSync(target)) {
            dirs.add(fs.realpathSync(target));
          }
        }
      }
    } catch (e) {}
  }

  return Array.from(dirs);
}

function patchPackageJson(dir) {
  const pkgPath = path.join(dir, 'package.json');
  if (!fs.existsSync(pkgPath)) return;
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
    if (pkg.codegenConfig) {
      delete pkg.codegenConfig;
      fs.writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + '\n');
      console.log(`[patch-admob] codegenConfig removido de: ${pkgPath}`);
    } else {
      console.log(`[patch-admob] codegenConfig já não existe em: ${pkgPath}`);
    }
  } catch (err) {
    console.error(`[patch-admob] Erro ao atualizar package.json em ${dir}:`, err);
  }
}

function patchBuildGradle(dir) {
  const gradlePath = path.join(dir, 'android/build.gradle');
  if (!fs.existsSync(gradlePath)) return;
  try {
    let gradle = fs.readFileSync(gradlePath, 'utf8');

    // Substitui a checagem que força nova arquitetura ou lança exceção
    const originalArchCheckPattern = /def isNewArchitectureDisabled\(\)\s*\{[\s\S]*?if\s*\(isNewArchitectureDisabled\(\)\)\s*\{[\s\S]*?\}\s*if\s*\(isNewArchitectureEnabled\(\)\)\s*\{[\s\S]*?\}/;

    const safeArchBlock = `def isNewArchitectureDisabled() {
    return true
}

def isNewArchitectureEnabled() {
    return false
}

// Interop mode: Não aplica com.facebook.react nem gera C++ em libappmodules.so
if (isNewArchitectureEnabled()) {
    apply plugin: "com.facebook.react"
}`;

    if (originalArchCheckPattern.test(gradle)) {
      gradle = gradle.replace(originalArchCheckPattern, safeArchBlock);
      fs.writeFileSync(gradlePath, gradle, 'utf8');
      console.log(`[patch-admob] android/build.gradle corrigido para isolamento/oldarch em: ${gradlePath}`);
    } else if (gradle.includes('return false') && gradle.includes('Interop mode')) {
      console.log(`[patch-admob] android/build.gradle já está corrigido em: ${gradlePath}`);
    } else {
      console.warn(`[patch-admob] Padrão de verificação não encontrado em android/build.gradle em: ${gradlePath}`);
    }
  } catch (err) {
    console.error(`[patch-admob] Erro ao atualizar android/build.gradle em ${dir}:`, err);
  }
}

function writeNativeAppModuleSpec(dir) {
  const targetDir = path.join(dir, 'android/src/oldarch/io/invertase/googlemobileads');
  if (!fs.existsSync(targetDir)) {
    fs.mkdirSync(targetDir, { recursive: true });
  }

  const specPath = path.join(targetDir, 'NativeAppModuleSpec.java');
  const specContent = `package io.invertase.googlemobileads;

import com.facebook.react.bridge.Promise;
import com.facebook.react.bridge.ReactApplicationContext;
import com.facebook.react.bridge.ReactContextBaseJavaModule;
import com.facebook.react.bridge.ReadableMap;

/**
 * Spec stub para compatibilidade com o modo oldarch/interop.
 * Permite que ReactNativeAppModule compile normalmente sem gerar C++ em libappmodules.so.
 */
public abstract class NativeAppModuleSpec extends ReactContextBaseJavaModule {
  public static final String NAME = "RNAppModule";

  public NativeAppModuleSpec(ReactApplicationContext reactContext) {
    super(reactContext);
  }

  @Override
  public String getName() {
    return NAME;
  }

  public abstract void initializeApp(ReadableMap options, ReadableMap appConfig, Promise promise);
  public abstract void setAutomaticDataCollectionEnabled(String appName, boolean enabled);
  public abstract void deleteApp(String appName, Promise promise);
  public abstract void eventsNotifyReady(boolean ready);
  public abstract void eventsGetListeners(Promise promise);
  public abstract void eventsPing(String eventName, ReadableMap eventBody, Promise promise);
  public abstract void eventsAddListener(String eventName);
  public abstract void eventsRemoveListener(String eventName, boolean all);
  public abstract void addListener(String eventName);
  public abstract void removeListeners(double count);
  public abstract void metaGetAll(Promise promise);
  public abstract void jsonGetAll(Promise promise);
  public abstract void preferencesSetBool(String key, boolean value, Promise promise);
  public abstract void preferencesSetString(String key, String value, Promise promise);
  public abstract void preferencesGetAll(Promise promise);
  public abstract void preferencesClearAll(Promise promise);
}
`;

  try {
    fs.writeFileSync(specPath, specContent, 'utf8');
    console.log(`[patch-admob] NativeAppModuleSpec.java criado em: ${specPath}`);
  } catch (err) {
    console.error(`[patch-admob] Erro ao criar NativeAppModuleSpec.java em ${targetDir}:`, err);
  }
}

function run() {
  const dirs = findAdMobDirs();
  if (dirs.length === 0) {
    console.warn('[patch-admob] react-native-google-mobile-ads não encontrado!');
    return;
  }

  for (const dir of dirs) {
    console.log(`[patch-admob] Aplicando patch em: ${dir}`);
    patchPackageJson(dir);
    patchBuildGradle(dir);
    writeNativeAppModuleSpec(dir);
  }
}

run();

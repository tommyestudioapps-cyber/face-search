const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('expo/config-plugins');

const MODEL_FILENAME = 'face-recognition.tflite';
const MODEL_DIRECTORY = ['assets', 'models'];

function withFaceRecognitionModel(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const source = path.join(
        config.modRequest.projectRoot,
        ...MODEL_DIRECTORY,
        MODEL_FILENAME,
      );
      const destinationDirectory = path.join(
        config.modRequest.platformProjectRoot,
        'app',
        'src',
        'main',
        'assets',
      );
      const destination = path.join(destinationDirectory, MODEL_FILENAME);

      if (!fs.existsSync(source)) {
        throw new Error(`Missing face recognition model asset: ${source}`);
      }

      const sourceStats = fs.statSync(source);
      if (!sourceStats.isFile() || sourceStats.size === 0) {
        throw new Error(`Invalid face recognition model asset: ${source}`);
      }

      fs.mkdirSync(destinationDirectory, { recursive: true });
      fs.copyFileSync(source, destination);

      return config;
    },
  ]);
}

module.exports = withFaceRecognitionModel;
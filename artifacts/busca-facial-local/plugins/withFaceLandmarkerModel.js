const fs = require('fs');
const path = require('path');
const { withDangerousMod } = require('@expo/config-plugins');

const MODEL_FILENAME = 'face-landmarker.task';

function withFaceLandmarkerModel(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const source = path.join(
        config.modRequest.projectRoot,
        'assets',
        'models',
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
        throw new Error(`Missing MediaPipe model asset: ${source}`);
      }

      fs.mkdirSync(destinationDirectory, { recursive: true });
      fs.copyFileSync(source, destination);

      return config;
    },
  ]);
}

module.exports = withFaceLandmarkerModel;
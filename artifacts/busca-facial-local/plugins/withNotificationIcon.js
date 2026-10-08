const { withDangerousMod } = require('expo/config-plugins');
const fs = require('fs');
const path = require('path');

module.exports = function withNotificationIcon(config) {
  return withDangerousMod(config, [
    'android',
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;
      const source = path.join(projectRoot, 'assets', 'notification-icon.xml');
      const targetDir = path.join(
        projectRoot,
        'android',
        'app',
        'src',
        'main',
        'res',
        'drawable',
      );
      const target = path.join(targetDir, 'ic_notification.xml');

      if (!fs.existsSync(source)) {
        throw new Error(`Notification icon not found at ${source}`);
      }
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }
      fs.copyFileSync(source, target);
      return config;
    },
  ]);
};

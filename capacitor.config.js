const config = {
  appId: 'com.pocketbounty.app',
  appName: 'Pocket Bounty',
  webDir: 'dist/public',
  server: {
    androidScheme: 'https'
  },
  plugins: {
    Browser: {
      presentationStyle: 'popover'
    }
  }
};

module.exports = config;
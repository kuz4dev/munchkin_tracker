// Expo's default config already handles npm workspaces (packages/core).
const { getDefaultConfig } = require('expo/metro-config')
const { withNativeWind } = require('nativewind/metro')

module.exports = withNativeWind(getDefaultConfig(__dirname), { input: './global.css' })

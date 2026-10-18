const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

// Bundle the object detection models (assets/models/*.onnx) as assets.
config.resolver.assetExts.push("onnx");

module.exports = config;

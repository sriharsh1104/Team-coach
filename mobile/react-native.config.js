module.exports = {
  // Without this, Ionicons.ttf doesn't get linked into standalone/EAS
  // builds — icons render as blank glyphs (the touchable area and onPress
  // still work since only the font is missing) even though the same build
  // shows them fine via Metro's dev bundler.
  assets: ['./node_modules/@expo/vector-icons/build/vendor/react-native-vector-icons/Fonts'],
};

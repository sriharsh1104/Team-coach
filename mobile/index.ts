// Must run before any LiveKit / WebRTC import — Hermes often lacks WeakRef.
import './src/polyfills/weakRef';

import { registerRootComponent } from 'expo';

import App from './App';

// registerRootComponent calls AppRegistry.registerComponent('main', () => App);
// It also ensures that whether you load the app in Expo Go or in a native build,
// the environment is set up appropriately
registerRootComponent(App);

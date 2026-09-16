import { Capacitor, registerPlugin } from '@capacitor/core';

interface KeyboardBridgePlugin {
  show(): Promise<void>;
}

const KeyboardBridge = registerPlugin<KeyboardBridgePlugin>('KeyboardBridge');

export async function showAndroidKeyboard(): Promise<void> {
  if (Capacitor.getPlatform() === 'android') {
    await KeyboardBridge.show();
  }
}

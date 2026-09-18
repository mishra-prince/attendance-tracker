import { useEffect } from 'react';
import { Capacitor } from '@capacitor/core';

/** Native Android polish: dark status bar matching the app's void theme, dark keyboard. */
export default function useNativeTheme() {
  useEffect(() => {
    if (!Capacitor.isNativePlatform()) return;
    (async () => {
      try {
        const { StatusBar, Style } = await import('@capacitor/status-bar');
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: '#0A0908' });
      } catch { /* plugin not ready — non-fatal */ }
      try {
        const { Keyboard } = await import('@capacitor/keyboard');
        await Keyboard.setAccessoryBarVisible({ isVisible: false });
      } catch { /* non-fatal */ }
    })();
  }, []);
}

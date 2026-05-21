import React, { useRef, useState, useCallback, useEffect } from 'react';
import {
  StyleSheet,
  View,
  ActivityIndicator,
  SafeAreaView,
  StatusBar,
  Platform,
  BackHandler,
  Text,
  TouchableOpacity,
  Share,
  Linking,
  Animated,
  Dimensions,
} from 'react-native';
import { WebView } from 'react-native-webview';
import NetInfo from '@react-native-community/netinfo';
import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import * as SplashScreen from 'expo-splash-screen';
import AsyncStorage from '@react-native-async-storage/async-storage';

// ─── Constants ───────────────────────────────────────────────────────────────
const WEBSITE_URL = 'https://lairaboost.com';
const APP_VERSION = '2.0.0';
const APP_NAME = 'lairaboost';

const COLORS = {
  bg: '#1a1c24',
  bgLight: '#22252e',
  bgCard: '#2a2d37',
  accent: '#3B82F6',
  accentDark: '#2563EB',
  white: '#ffffff',
  textSecondary: '#9ca3af',
  textMuted: '#6b7280',
  border: '#333640',
  error: '#ef4444',
  success: '#22c55e',
};

const { width: SCREEN_WIDTH } = Dimensions.get('window');

// ─── Keep splash visible until we're ready ───────────────────────────────────
SplashScreen.preventAutoHideAsync().catch(() => {});

// ─── Analytics ───────────────────────────────────────────────────────────────
let deviceId = null;
let sessionId = null;

async function getDeviceId() {
  if (deviceId) return deviceId;
  let stored = await AsyncStorage.getItem('lairaboost_device_id');
  if (!stored) {
    stored = 'dev_' + Math.random().toString(36).substr(2, 12) + Date.now().toString(36);
    await AsyncStorage.setItem('lairaboost_device_id', stored);
  }
  deviceId = stored;
  return stored;
}

async function startAnalyticsSession() {
  try {
    const did = await getDeviceId();
    const resp = await fetch(WEBSITE_URL + '/api/analytics/session/start', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        device_id: did,
        platform: Platform.OS,
        app_version: APP_VERSION,
        app_name: APP_NAME,
      }),
    });
    const data = await resp.json();
    sessionId = data.session_id;
  } catch (e) {
    // Analytics should never block the app
  }
}

async function trackScreen(screenName, params) {
  try {
    const did = await getDeviceId();
    fetch(WEBSITE_URL + '/api/analytics/screen', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        session_id: sessionId,
        device_id: did,
        screen_name: screenName,
        screen_params: params,
      }),
    }).catch(() => {});
  } catch (e) {}
}

// ─── Push Notifications ──────────────────────────────────────────────────────
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
  }),
});

async function sendTokenToServer(token) {
  const resp = await fetch(WEBSITE_URL + '/api/notifications/register-token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      token,
      platform: Platform.OS,
      deviceName: Device.deviceName || Device.modelName || 'Unknown',
      appVersion: APP_VERSION,
    }),
  });
  if (!resp.ok) throw new Error('Server returned ' + resp.status);
}

async function registerForPushNotifications() {
  if (!Device.isDevice) return null;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('default', {
      name: 'Lairaboost',
      importance: Notifications.AndroidImportance.MAX,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: COLORS.accent,
    });
  }

  const { status: existingStatus } = await Notifications.getPermissionsAsync();
  let finalStatus = existingStatus;

  if (existingStatus !== 'granted') {
    const { status } = await Notifications.requestPermissionsAsync();
    finalStatus = status;
  }

  if (finalStatus !== 'granted') return null;

  try {
    const projectId = 'REPLACE_WITH_EAS_PROJECT_ID';
    const tokenData = await Notifications.getExpoPushTokenAsync({ projectId });
    const token = tokenData.data;

    try {
      await sendTokenToServer(token);
    } catch (e) {
      // Retry once after delay
      setTimeout(() => sendTokenToServer(token).catch(() => {}), 5000);
    }

    return token;
  } catch (e) {
    return null;
  }
}

// ─── SVG-free Icons (using Unicode/Text) ─────────────────────────────────────
// Using simple text-based icons to avoid react-native-svg dependency
function HeaderShareIcon({ color = COLORS.white, size = 20 }) {
  return (
    <Text style={{ fontSize: size, color, fontWeight: '600' }}>
      {'↗'}
    </Text>
  );
}

function HeaderBackIcon({ color = COLORS.white, size = 20 }) {
  return (
    <Text style={{ fontSize: size, color, fontWeight: '700' }}>
      {'‹'}
    </Text>
  );
}

function HeaderRefreshIcon({ color = COLORS.white, size = 18 }) {
  return (
    <Text style={{ fontSize: size, color, fontWeight: '600' }}>
      {'↻'}
    </Text>
  );
}

// ─── Offline Screen ──────────────────────────────────────────────────────────
function OfflineScreen({ onRetry }) {
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 0.4,
          duration: 1200,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1200,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();
    return () => pulse.stop();
  }, [pulseAnim]);

  return (
    <SafeAreaView style={styles.offlineContainer}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      <View style={styles.offlineContent}>
        <Animated.View style={[styles.offlineIconCircle, { opacity: pulseAnim }]}>
          <Text style={styles.offlineIcon}>{'⚡'}</Text>
        </Animated.View>
        <Text style={styles.offlineTitle}>No Internet Connection</Text>
        <Text style={styles.offlineMessage}>
          Please check your Wi-Fi or mobile data connection and try again.
        </Text>
        <TouchableOpacity style={styles.retryButton} onPress={onRetry} activeOpacity={0.8}>
          <Text style={styles.retryButtonText}>Try Again</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

// ─── Loading Screen ──────────────────────────────────────────────────────────
function LoadingScreen() {
  return (
    <View style={styles.loadingScreen}>
      <ActivityIndicator size="large" color={COLORS.accent} />
      <Text style={styles.loadingText}>Loading Lairaboost...</Text>
    </View>
  );
}

// ─── Main App ────────────────────────────────────────────────────────────────
export default function App() {
  const webViewRef = useRef(null);
  const [isConnected, setIsConnected] = useState(true);
  const [webViewLoading, setWebViewLoading] = useState(true);
  const [hasError, setHasError] = useState(false);
  const [currentUrl, setCurrentUrl] = useState(WEBSITE_URL);
  const [canGoBack, setCanGoBack] = useState(false);
  const [pageTitle, setPageTitle] = useState('Lairaboost');
  const [appReady, setAppReady] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);

  // ── Network monitoring ──
  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(state => {
      const connected = state.isConnected && state.isInternetReachable !== false;
      setIsConnected(connected);
    });
    return () => unsubscribe();
  }, []);

  // ── App initialization ──
  useEffect(() => {
    async function init() {
      // Start analytics
      startAnalyticsSession();

      // Small delay to let splash show
      await new Promise(resolve => setTimeout(resolve, 800));

      setAppReady(true);
      await SplashScreen.hideAsync().catch(() => {});

      // Register for push notifications after a short delay
      setTimeout(() => {
        registerForPushNotifications();
      }, 3000);
    }

    init();
  }, []);

  // ── Push notification deep linking ──
  useEffect(() => {
    const notifSub = Notifications.addNotificationResponseReceivedListener(response => {
      const url = response.notification.request.content.data?.url;
      if (url && webViewRef.current) {
        webViewRef.current.injectJavaScript(`window.location.href='${url}';true;`);
      }
    });
    return () => notifSub.remove();
  }, []);

  // ── Android back button ──
  useEffect(() => {
    if (Platform.OS === 'android') {
      const sub = BackHandler.addEventListener('hardwareBackPress', () => {
        if (canGoBack && webViewRef.current) {
          webViewRef.current.goBack();
          return true;
        }
        return false;
      });
      return () => sub.remove();
    }
  }, [canGoBack]);

  // ── Share handler ──
  const handleShare = useCallback(async () => {
    try {
      const shareUrl = currentUrl || WEBSITE_URL;
      const result = await Share.share({
        message: Platform.OS === 'android'
          ? `Check out Lairaboost - Social Media Marketing Services: ${shareUrl}`
          : undefined,
        url: Platform.OS === 'ios' ? shareUrl : undefined,
        title: 'Lairaboost',
      });
      if (result.action === Share.sharedAction) {
        trackScreen('share', { url: shareUrl });
      }
    } catch (e) {
      // Share cancelled or failed
    }
  }, [currentUrl]);

  // ── Pull to refresh ──
  const handleRefresh = useCallback(() => {
    setIsRefreshing(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
    // Timeout fallback in case onLoadEnd doesn't fire
    setTimeout(() => setIsRefreshing(false), 5000);
  }, []);

  // ── Navigation handler ──
  const handleNavigationChange = useCallback((navState) => {
    const url = navState.url || '';
    setCurrentUrl(url);
    setCanGoBack(navState.canGoBack);

    // Extract page title
    if (navState.title && navState.title !== url) {
      // Clean up title - remove " - Lairaboost" suffix if present
      let title = navState.title;
      title = title.replace(/\s*[-|]\s*Lairaboost.*$/i, '').trim();
      setPageTitle(title || 'Lairaboost');
    }

    // Track screen view
    try {
      const parsed = new URL(url);
      const path = parsed.pathname;
      const screenName = path === '/' ? 'home' : path.replace(/^\//, '').split('/')[0] || 'home';
      trackScreen(screenName, { path });
    } catch (e) {}
  }, []);

  // ── Error handler ──
  const handleError = useCallback(() => {
    setHasError(true);
    setWebViewLoading(false);
  }, []);

  // ── Retry handler ──
  const handleRetry = useCallback(() => {
    setHasError(false);
    setWebViewLoading(true);
    if (webViewRef.current) {
      webViewRef.current.reload();
    }
  }, []);

  // ── Network retry ──
  const handleNetworkRetry = useCallback(async () => {
    const state = await NetInfo.fetch();
    if (state.isConnected) {
      setIsConnected(true);
      if (webViewRef.current) {
        webViewRef.current.reload();
      }
    }
  }, []);

  // ── Inject JS to adapt Lairaboost site for in-app display ──
  const injectedJS = `
    (function() {
      // Signal we're in the native app
      document.documentElement.classList.add('in-app');
      document.documentElement.setAttribute('data-app', 'lairaboost-native');

      // Prevent horizontal scroll
      document.documentElement.style.overflowX = 'hidden';
      document.body.style.overflowX = 'hidden';

      // Ensure proper viewport
      var meta = document.querySelector('meta[name="viewport"]');
      if (!meta) {
        meta = document.createElement('meta');
        meta.name = 'viewport';
        document.head.appendChild(meta);
      }
      meta.content = 'width=device-width,initial-scale=1,maximum-scale=5,user-scalable=yes';

      // Add padding-top for native header if content is under it
      if (!document.getElementById('lairaboost-app-style')) {
        var style = document.createElement('style');
        style.id = 'lairaboost-app-style';
        style.textContent = 'body { padding-top: 0 !important; }';
        document.head.appendChild(style);
      }

      // Handle external links - open in system browser
      document.addEventListener('click', function(e) {
        var link = e.target.closest('a');
        if (link && link.href) {
          var url = link.href;
          // Open external links in system browser
          if (url.indexOf('lairaboost.com') === -1 && url.indexOf('http') === 0) {
            e.preventDefault();
            window.ReactNativeWebView.postMessage(JSON.stringify({ type: 'external_link', url: url }));
          }
        }
      }, true);

      true;
    })();
  `;

  // ── Handle messages from WebView ──
  const handleMessage = useCallback((event) => {
    try {
      const data = JSON.parse(event.nativeEvent.data);
      if (data.type === 'external_link' && data.url) {
        Linking.openURL(data.url).catch(() => {});
      }
    } catch (e) {}
  }, []);

  // ── Don't render until app is ready ──
  if (!appReady) {
    return (
      <View style={[styles.container, { justifyContent: 'center', alignItems: 'center' }]}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
      </View>
    );
  }

  // ── Offline screen ──
  if (!isConnected) {
    return <OfflineScreen onRetry={handleNetworkRetry} />;
  }

  // ── Error screen ──
  if (hasError) {
    return (
      <SafeAreaView style={styles.container}>
        <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />
        <View style={styles.errorContainer}>
          <Text style={styles.errorIcon}>{'⚠️'}</Text>
          <Text style={styles.errorTitle}>Connection Error</Text>
          <Text style={styles.errorMessage}>
            Unable to load Lairaboost. Please check your connection and try again.
          </Text>
          <TouchableOpacity style={styles.retryButton} onPress={handleRetry} activeOpacity={0.8}>
            <Text style={styles.retryButtonText}>Retry</Text>
          </TouchableOpacity>
        </View>
      </SafeAreaView>
    );
  }

  // ── Main app ──
  return (
    <SafeAreaView style={styles.container}>
      <StatusBar barStyle="light-content" backgroundColor={COLORS.bg} />

      {/* ── Native Header Bar ── */}
      <View style={styles.header}>
        <View style={styles.headerLeft}>
          {canGoBack ? (
            <TouchableOpacity
              style={styles.headerButton}
              onPress={() => webViewRef.current?.goBack()}
              activeOpacity={0.7}
              hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
            >
              <HeaderBackIcon size={28} />
            </TouchableOpacity>
          ) : (
            <View style={styles.headerButtonPlaceholder} />
          )}
        </View>

        <View style={styles.headerCenter}>
          <Text style={styles.headerBrand}>LAIRABOOST</Text>
          <Text style={styles.headerSubtitle} numberOfLines={1}>
            {pageTitle !== 'Lairaboost' ? pageTitle : 'SMM Services'}
          </Text>
        </View>

        <View style={styles.headerRight}>
          <TouchableOpacity
            style={styles.headerButton}
            onPress={handleRefresh}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <HeaderRefreshIcon />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.headerButton, { marginLeft: 4 }]}
            onPress={handleShare}
            activeOpacity={0.7}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <HeaderShareIcon />
          </TouchableOpacity>
        </View>
      </View>

      {/* ── WebView ── */}
      <View style={styles.webviewContainer}>
        <WebView
          ref={webViewRef}
          source={{ uri: WEBSITE_URL }}
          style={styles.webview}
          onLoadStart={() => setWebViewLoading(true)}
          onLoadEnd={() => {
            setWebViewLoading(false);
            setIsRefreshing(false);
          }}
          onError={handleError}
          onHttpError={(syntheticEvent) => {
            const { nativeEvent } = syntheticEvent;
            // Only treat 5xx as errors
            if (nativeEvent.statusCode >= 500) {
              handleError();
            }
          }}
          onNavigationStateChange={handleNavigationChange}
          onMessage={handleMessage}
          injectedJavaScript={injectedJS}
          javaScriptEnabled={true}
          domStorageEnabled={true}
          startInLoadingState={false}
          allowsBackForwardNavigationGestures={true}
          allowsInlineMediaPlayback={true}
          mediaPlaybackRequiresUserAction={false}
          sharedCookiesEnabled={true}
          thirdPartyCookiesEnabled={true}
          pullToRefreshEnabled={true}
          keyboardDisplayRequiresUserAction={false}
          autoManageStatusBarEnabled={false}
          contentMode="mobile"
          cacheEnabled={true}
          cacheMode="LOAD_DEFAULT"
          mixedContentMode="compatibility"
          allowFileAccess={true}
          allowUniversalAccessFromFileURLs={false}
          scalesPageToFit={true}
          textZoom={100}
          setSupportMultipleWindows={false}
          overScrollMode="never"
          userAgent={`Mozilla/5.0 (Linux; Android 14) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/125.0 Mobile Safari/537.36 LairaboostApp/${APP_VERSION}`}
          renderLoading={() => <LoadingScreen />}
        />

        {/* Loading overlay */}
        {webViewLoading && (
          <View style={styles.loadingOverlay} pointerEvents="none">
            <ActivityIndicator size="large" color={COLORS.accent} />
          </View>
        )}

        {/* Pull-to-refresh indicator at top */}
        {isRefreshing && (
          <View style={styles.refreshIndicator} pointerEvents="none">
            <View style={styles.refreshPill}>
              <ActivityIndicator size="small" color={COLORS.white} />
              <Text style={styles.refreshText}>Refreshing...</Text>
            </View>
          </View>
        )}
      </View>
    </SafeAreaView>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // Header
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: COLORS.bg,
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: COLORS.border,
    ...Platform.select({
      android: {
        paddingTop: StatusBar.currentHeight ? 10 : 10,
      },
    }),
  },
  headerLeft: {
    width: 44,
    alignItems: 'flex-start',
  },
  headerCenter: {
    flex: 1,
    alignItems: 'center',
  },
  headerBrand: {
    fontSize: 16,
    fontWeight: '800',
    color: COLORS.white,
    letterSpacing: 2,
  },
  headerSubtitle: {
    fontSize: 11,
    color: COLORS.textMuted,
    marginTop: 1,
    maxWidth: SCREEN_WIDTH * 0.5,
  },
  headerRight: {
    width: 80,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'flex-end',
  },
  headerButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    backgroundColor: COLORS.bgLight,
    alignItems: 'center',
    justifyContent: 'center',
  },
  headerButtonPlaceholder: {
    width: 36,
    height: 36,
  },

  // WebView
  webviewContainer: {
    flex: 1,
  },
  webview: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },

  // Loading
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: 'rgba(26, 28, 36, 0.92)',
  },
  loadingScreen: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.bg,
  },
  loadingText: {
    color: COLORS.textSecondary,
    fontSize: 14,
    marginTop: 12,
  },

  // Refresh indicator
  refreshIndicator: {
    position: 'absolute',
    top: 10,
    left: 0,
    right: 0,
    alignItems: 'center',
  },
  refreshPill: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: COLORS.accent,
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 20,
    elevation: 4,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
  },
  refreshText: {
    color: COLORS.white,
    fontSize: 13,
    fontWeight: '600',
    marginLeft: 8,
  },

  // Offline screen
  offlineContainer: {
    flex: 1,
    backgroundColor: COLORS.bg,
  },
  offlineContent: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
  },
  offlineIconCircle: {
    width: 100,
    height: 100,
    borderRadius: 50,
    backgroundColor: COLORS.bgCard,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 24,
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  offlineIcon: {
    fontSize: 40,
  },
  offlineTitle: {
    fontSize: 24,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 12,
    textAlign: 'center',
  },
  offlineMessage: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 32,
    lineHeight: 22,
    maxWidth: 300,
  },

  // Error screen
  errorContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 40,
    backgroundColor: COLORS.bg,
  },
  errorIcon: {
    fontSize: 48,
    marginBottom: 16,
  },
  errorTitle: {
    fontSize: 22,
    fontWeight: '700',
    color: COLORS.white,
    marginBottom: 12,
  },
  errorMessage: {
    fontSize: 15,
    color: COLORS.textSecondary,
    textAlign: 'center',
    marginBottom: 28,
    lineHeight: 22,
    maxWidth: 300,
  },

  // Retry button (shared)
  retryButton: {
    backgroundColor: COLORS.accent,
    paddingHorizontal: 40,
    paddingVertical: 14,
    borderRadius: 12,
    elevation: 3,
    shadowColor: COLORS.accent,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 6,
  },
  retryButtonText: {
    color: COLORS.white,
    fontSize: 16,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

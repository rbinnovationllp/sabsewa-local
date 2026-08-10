import { usePathname } from "expo-router";
import { useEffect, useMemo, useState } from "react";
import { Platform, ScrollView, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { apiUrl, authenticatedFetch } from "@/lib/backend";
import { useAuth } from "@/providers/AuthProvider";
import { useLanguage } from "@/providers/LanguageProvider";

type BeforeInstallPromptEvent = Event & {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed" }>;
};

type InstallTab = "android" | "ios" | "computer";

const DISMISS_DAYS = 14;
const DISMISS_KEY = "sabsewa_pwa_install_dismissed_until";

const COPY = {
  en: {
    floatingTitle: "Install SabSewa Local",
    floatingShort: "Shop locally with one tap",
    floatingText: "Install SabSewa Local on your home screen for quick and convenient access. No repeated website search or URL entry is required.",
    guideHeading: "How to Install SabSewa Local",
    supportText:
      "Add SabSewa Local to your phone's home screen for faster access. You will not need to enter www.sabsewa.in every time you want to shop.",
    bridgeText:
      "This facility helps you use the SabSewa Local web application like a mobile app until the native Android application becomes available through Google Play.",
    android: "Android",
    ios: "iPhone/iPad",
    computer: "Computer",
    installNow: "Install Now",
    openApp: "Open SabSewa Local",
    later: "Later",
    close: "Close",
    notifications: "Notifications",
    androidTitle: "Install on an Android phone",
    androidSteps: [
      "Open www.sabsewa.in in Google Chrome.",
      "Tap the three-dot menu in the upper-right corner.",
      "Select Install app or Add to Home screen.",
      "Tap Install or Add to confirm.",
      "The SabSewa Local icon will appear on your home screen.",
      "Tap the icon whenever you want to shop from nearby local stores.",
    ],
    iosTitle: "Add to an iPhone or iPad",
    iosSteps: [
      "Open www.sabsewa.in in Safari.",
      "Tap the Share button.",
      "Scroll down and select Add to Home Screen.",
      "Confirm the name SabSewa Local.",
      "Tap Add.",
      "The SabSewa Local icon will appear on the home screen.",
      "Tap the icon whenever you want to shop from nearby local stores.",
    ],
    iosNote:
      "On iPhone and iPad, Apple requires you to add the application through Safari's Share menu. The website cannot complete this step automatically.",
    iosBrowserNote: "If you opened this website in Chrome or another browser on iPhone, open it in Safari to add it to your home screen.",
    computerTitle: "Install on a computer",
    computerSteps: [
      "Open www.sabsewa.in.",
      "Select the installation icon in the address bar or open the browser menu.",
      "Select Install SabSewa Local.",
      "Confirm the installation.",
      "Launch SabSewa Local from the desktop, Start menu or applications list.",
    ],
    promptUnavailable: "If your browser does not show Install Now, use the steps shown for your device.",
    pushUnsupported: "Push notifications are not supported in this browser.",
    pushNeedsKeys: "Push notifications will be enabled after secure VAPID keys are configured.",
    pushDenied: "Notification permission was not granted.",
    pushEnabled: "Notifications enabled for this device.",
    updateTitle: "Update available",
    updateText: "A newer SabSewa Local version is ready.",
    updateNow: "Update Now",
  },
  hi: {
    floatingTitle: "SabSewa Local इंस्टॉल करें",
    floatingShort: "एक टैप में स्थानीय खरीदारी",
    floatingText: "जल्दी और सुविधाजनक उपयोग के लिए SabSewa Local को अपने होम स्क्रीन पर जोड़ें। बार-बार वेबसाइट खोजने या URL लिखने की जरूरत नहीं होगी।",
    guideHeading: "SabSewa Local कैसे इंस्टॉल करें",
    supportText: "तेज पहुंच के लिए SabSewa Local को अपने फोन के होम स्क्रीन पर जोड़ें। खरीदारी के लिए हर बार www.sabsewa.in दर्ज नहीं करना पड़ेगा।",
    bridgeText: "Google Play पर native Android app उपलब्ध होने तक यह सुविधा SabSewa Local web application को mobile app की तरह इस्तेमाल करने में मदद करेगी।",
    android: "Android",
    ios: "iPhone/iPad",
    computer: "Computer",
    installNow: "अभी इंस्टॉल करें",
    openApp: "SabSewa Local खोलें",
    later: "बाद में",
    close: "बंद करें",
    notifications: "Notifications",
    androidTitle: "Android फोन पर इंस्टॉल करें",
    androidSteps: [
      "Google Chrome में www.sabsewa.in खोलें।",
      "ऊपर दाईं ओर तीन-dot menu पर टैप करें।",
      "Install app या Add to Home screen चुनें।",
      "Confirm करने के लिए Install या Add पर टैप करें।",
      "SabSewa Local icon आपके home screen पर दिखाई देगा।",
      "नजदीकी local stores से खरीदारी के लिए icon पर टैप करें।",
    ],
    iosTitle: "iPhone या iPad में जोड़ें",
    iosSteps: [
      "Safari में www.sabsewa.in खोलें।",
      "Share button पर टैप करें।",
      "नीचे scroll करके Add to Home Screen चुनें।",
      "नाम SabSewa Local confirm करें।",
      "Add पर टैप करें।",
      "SabSewa Local icon home screen पर दिखाई देगा।",
      "नजदीकी local stores से खरीदारी के लिए icon पर टैप करें।",
    ],
    iosNote: "iPhone और iPad पर Apple आपको Safari के Share menu से application जोड़ने की अनुमति देता है। Website यह step अपने आप पूरा नहीं कर सकती।",
    iosBrowserNote: "अगर आपने iPhone पर यह website Chrome या किसी दूसरे browser में खोली है, तो home screen में जोड़ने के लिए इसे Safari में खोलें।",
    computerTitle: "Computer पर इंस्टॉल करें",
    computerSteps: [
      "www.sabsewa.in खोलें।",
      "Address bar में installation icon चुनें या browser menu खोलें।",
      "Install SabSewa Local चुनें।",
      "Installation confirm करें।",
      "SabSewa Local को desktop, Start menu या applications list से launch करें।",
    ],
    promptUnavailable: "अगर browser Install Now नहीं दिखाता, तो अपने device के steps follow करें।",
    pushUnsupported: "इस browser में push notifications supported नहीं हैं।",
    pushNeedsKeys: "Secure VAPID keys configure होने के बाद push notifications enable होंगे।",
    pushDenied: "Notification permission नहीं मिली।",
    pushEnabled: "इस device के लिए notifications enabled हैं।",
    updateTitle: "Update available",
    updateText: "SabSewa Local का नया version ready है।",
    updateNow: "Update Now",
  },
  kn: {
    floatingTitle: "SabSewa Local install ಮಾಡಿ",
    floatingShort: "ಒಂದು tap ನಲ್ಲಿ ಸ್ಥಳೀಯ ಖರೀದಿ",
    floatingText: "ವೇಗವಾಗಿ ಬಳಸಲು SabSewa Local ಅನ್ನು ನಿಮ್ಮ phone home screen ಗೆ ಸೇರಿಸಿ. ಪ್ರತಿ ಬಾರಿ website ಹುಡುಕುವ ಅಥವಾ URL ನಮೂದಿಸುವ ಅಗತ್ಯವಿಲ್ಲ.",
    guideHeading: "SabSewa Local ಹೇಗೆ install ಮಾಡುವುದು",
    supportText: "ವೇಗವಾದ access ಗಾಗಿ SabSewa Local ಅನ್ನು phone home screen ಗೆ ಸೇರಿಸಿ. Shopping ಮಾಡಲು ಪ್ರತಿ ಬಾರಿ www.sabsewa.in ನಮೂದಿಸುವ ಅಗತ್ಯವಿಲ್ಲ.",
    bridgeText: "Google Play ನಲ್ಲಿ native Android application ಲಭ್ಯವಾಗುವವರೆಗೆ SabSewa Local web application ಅನ್ನು mobile app ರೀತಿಯಲ್ಲಿ ಬಳಸಲು ಇದು ಸಹಾಯ ಮಾಡುತ್ತದೆ.",
    android: "Android",
    ios: "iPhone/iPad",
    computer: "Computer",
    installNow: "ಈಗ install ಮಾಡಿ",
    openApp: "SabSewa Local ತೆರೆಯಿರಿ",
    later: "ನಂತರ",
    close: "ಮುಚ್ಚಿ",
    notifications: "Notifications",
    androidTitle: "Android phone ನಲ್ಲಿ install ಮಾಡಿ",
    androidSteps: [
      "Google Chrome ನಲ್ಲಿ www.sabsewa.in ತೆರೆಯಿರಿ.",
      "ಮೇಲಿನ ಬಲಭಾಗದ three-dot menu tap ಮಾಡಿ.",
      "Install app ಅಥವಾ Add to Home screen ಆಯ್ಕೆ ಮಾಡಿ.",
      "Confirm ಮಾಡಲು Install ಅಥವಾ Add tap ಮಾಡಿ.",
      "SabSewa Local icon ನಿಮ್ಮ home screen ನಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.",
      "ಹತ್ತಿರದ local stores ನಿಂದ shopping ಮಾಡಲು icon tap ಮಾಡಿ.",
    ],
    iosTitle: "iPhone ಅಥವಾ iPad ಗೆ ಸೇರಿಸಿ",
    iosSteps: [
      "Safari ನಲ್ಲಿ www.sabsewa.in ತೆರೆಯಿರಿ.",
      "Share button tap ಮಾಡಿ.",
      "ಕೆಳಗೆ scroll ಮಾಡಿ Add to Home Screen ಆಯ್ಕೆ ಮಾಡಿ.",
      "SabSewa Local ಹೆಸರನ್ನು confirm ಮಾಡಿ.",
      "Add tap ಮಾಡಿ.",
      "SabSewa Local icon home screen ನಲ್ಲಿ ಕಾಣಿಸುತ್ತದೆ.",
      "ಹತ್ತಿರದ local stores ನಿಂದ shopping ಮಾಡಲು icon tap ಮಾಡಿ.",
    ],
    iosNote: "iPhone ಮತ್ತು iPad ನಲ್ಲಿ Apple Safari Share menu ಮೂಲಕ application ಸೇರಿಸಲು ಮಾತ್ರ ಅವಕಾಶ ಕೊಡುತ್ತದೆ. Website ಈ step ಅನ್ನು ಸ್ವಯಂಚಾಲಿತವಾಗಿ ಪೂರ್ಣಗೊಳಿಸಲು ಸಾಧ್ಯವಿಲ್ಲ.",
    iosBrowserNote: "iPhone ನಲ್ಲಿ Chrome ಅಥವಾ ಬೇರೆ browser ನಲ್ಲಿ website ತೆರೆದಿದ್ದರೆ, home screen ಗೆ ಸೇರಿಸಲು Safari ನಲ್ಲಿ ತೆರೆಯಿರಿ.",
    computerTitle: "Computer ನಲ್ಲಿ install ಮಾಡಿ",
    computerSteps: [
      "www.sabsewa.in ತೆರೆಯಿರಿ.",
      "Address bar installation icon ಆಯ್ಕೆ ಮಾಡಿ ಅಥವಾ browser menu ತೆರೆಯಿರಿ.",
      "Install SabSewa Local ಆಯ್ಕೆ ಮಾಡಿ.",
      "Installation confirm ಮಾಡಿ.",
      "Desktop, Start menu ಅಥವಾ applications list ನಿಂದ SabSewa Local launch ಮಾಡಿ.",
    ],
    promptUnavailable: "Browser Install Now ತೋರಿಸದಿದ್ದರೆ, ನಿಮ್ಮ device ಗೆ ತಕ್ಕ steps ಅನುಸರಿಸಿ.",
    pushUnsupported: "ಈ browser ನಲ್ಲಿ push notifications support ಇಲ್ಲ.",
    pushNeedsKeys: "Secure VAPID keys configure ಆದ ನಂತರ push notifications enable ಆಗುತ್ತವೆ.",
    pushDenied: "Notification permission ಸಿಕ್ಕಿಲ್ಲ.",
    pushEnabled: "ಈ device ಗೆ notifications enabled ಆಗಿವೆ.",
    updateTitle: "Update available",
    updateText: "SabSewa Local ಹೊಸ version ready ಇದೆ.",
    updateNow: "Update Now",
  },
} as const;

function isStandalone() {
  if (Platform.OS !== "web" || typeof window === "undefined") return false;
  return window.matchMedia?.("(display-mode: standalone)")?.matches || (window.navigator as any).standalone === true;
}

function detectInitialTab(): InstallTab {
  if (Platform.OS !== "web" || typeof window === "undefined") return "android";
  const ua = window.navigator.userAgent || "";
  const isIOS = /iPad|iPhone|iPod/.test(ua) || ((window.navigator as any).platform === "MacIntel" && (window.navigator as any).maxTouchPoints > 1);
  if (isIOS) return "ios";
  if (/Android/i.test(ua)) return "android";
  return "computer";
}

function urlBase64ToUint8Array(value: string) {
  const padding = "=".repeat((4 - (value.length % 4)) % 4);
  const base64 = (value + padding).replace(/-/g, "+").replace(/_/g, "/");
  const rawData = window.atob(base64);
  return Uint8Array.from([...rawData].map((char) => char.charCodeAt(0)));
}

function isDismissed() {
  if (typeof window === "undefined") return false;
  const until = Number(window.localStorage.getItem(DISMISS_KEY) || "0");
  return until > Date.now();
}

function trackPwaEvent(name: string) {
  if (Platform.OS !== "web" || typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent("sabsewa:pwa-install", { detail: { name, at: new Date().toISOString() } }));
}

export default function PwaInstallPrompt() {
  const pathname = usePathname();
  const { user } = useAuth();
  const { language } = useLanguage();
  const copy = COPY[language as keyof typeof COPY] || COPY.en;
  const [installEvent, setInstallEvent] = useState<BeforeInstallPromptEvent | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [standalone, setStandalone] = useState(false);
  const [guideVisible, setGuideVisible] = useState(false);
  const [tab, setTab] = useState<InstallTab>("android");
  const [updateReady, setUpdateReady] = useState<ServiceWorker | null>(null);
  const [pushMessage, setPushMessage] = useState("");
  const vapidPublicKey = process.env.EXPO_PUBLIC_WEB_PUSH_VAPID_PUBLIC_KEY || "";

  const showOnHome = pathname === "/" || pathname === "";
  const canShowInstall = useMemo(
    () => Platform.OS === "web" && showOnHome && !standalone && !installed && !dismissed,
    [showOnHome, standalone, installed, dismissed]
  );

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    setStandalone(isStandalone());
    setDismissed(isDismissed());
    setTab(detectInitialTab());

    const promptHandler = (event: Event) => {
      event.preventDefault();
      setInstallEvent(event as BeforeInstallPromptEvent);
    };

    const installedHandler = () => {
      setInstalled(true);
      setInstallEvent(null);
      setGuideVisible(false);
      trackPwaEvent("installed");
    };

    window.addEventListener("beforeinstallprompt", promptHandler);
    window.addEventListener("appinstalled", installedHandler);

    navigator.serviceWorker?.ready
      .then((registration) => {
        if (registration.waiting) setUpdateReady(registration.waiting);
        registration.addEventListener("updatefound", () => {
          const worker = registration.installing;
          worker?.addEventListener("statechange", () => {
            if (worker.state === "installed" && navigator.serviceWorker.controller) {
              setUpdateReady(worker);
            }
          });
        });
      })
      .catch(() => {});

    navigator.serviceWorker?.addEventListener("controllerchange", () => {
      window.location.reload();
    });

    return () => {
      window.removeEventListener("beforeinstallprompt", promptHandler);
      window.removeEventListener("appinstalled", installedHandler);
    };
  }, []);

  function openGuide() {
    setGuideVisible(true);
    setTab(detectInitialTab());
    trackPwaEvent("guide_opened");
  }

  async function installNow() {
    if (!installEvent) return;
    await installEvent.prompt();
    const choice = await installEvent.userChoice;
    trackPwaEvent(choice.outcome === "accepted" ? "prompt_accepted" : "prompt_dismissed");
    if (choice.outcome === "accepted") setInstalled(true);
    setInstallEvent(null);
  }

  function dismissInstall() {
    setDismissed(true);
    setGuideVisible(false);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(DISMISS_KEY, String(Date.now() + DISMISS_DAYS * 24 * 60 * 60 * 1000));
    }
    trackPwaEvent("dismissed");
  }

  function openApp() {
    if (typeof window !== "undefined") window.location.assign("/");
  }

  function applyUpdate() {
    updateReady?.postMessage({ type: "SKIP_WAITING" });
  }

  async function enablePushNotifications() {
    setPushMessage("");
    if (Platform.OS !== "web" || typeof window === "undefined") return;
    if (!("Notification" in window) || !("PushManager" in window) || !navigator.serviceWorker) {
      setPushMessage(copy.pushUnsupported);
      return;
    }
    if (!vapidPublicKey) {
      setPushMessage(copy.pushNeedsKeys);
      return;
    }
    if (!user?.id) {
      setPushMessage("Please login before enabling notifications.");
      return;
    }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      setPushMessage(copy.pushDenied);
      return;
    }
    const registration = await navigator.serviceWorker.ready;
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
    });
    const response = await authenticatedFetch("/api/notifications/web-push-subscriptions", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        endpoint: subscription.endpoint,
        subscription,
        user_agent: window.navigator.userAgent,
      }),
    });
    const json = await response.json().catch(() => ({}));
    if (!response.ok || json.success === false) {
      throw new Error(json.error || "Unable to enable notifications for this device.");
    }
    setPushMessage(copy.pushEnabled);
    trackPwaEvent("push_enabled");
  }

  if (Platform.OS !== "web" || (standalone && !updateReady) || (!showOnHome && !updateReady)) return null;

  const activeSteps = tab === "android" ? copy.androidSteps : tab === "ios" ? copy.iosSteps : copy.computerSteps;
  const activeTitle = tab === "android" ? copy.androidTitle : tab === "ios" ? copy.iosTitle : copy.computerTitle;

  return (
    <View style={styles.shell} pointerEvents="box-none">
      {canShowInstall ? (
        <View style={styles.card}>
          <View style={styles.copy}>
            <Text style={styles.kicker}>{copy.floatingShort}</Text>
            <Text style={styles.title}>{copy.floatingTitle}</Text>
            <Text style={styles.text}>{copy.floatingText}</Text>
          </View>
          <View style={styles.actions}>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.floatingTitle} style={styles.primary} onPress={openGuide}>
              <Text style={styles.primaryText}>{copy.floatingTitle}</Text>
            </TouchableOpacity>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.later} style={styles.later} onPress={dismissInstall}>
              <Text style={styles.laterText}>{copy.later}</Text>
            </TouchableOpacity>
          </View>
        </View>
      ) : installed && showOnHome ? (
        <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.openApp} style={styles.openButton} onPress={openApp}>
          <Text style={styles.primaryText}>{copy.openApp}</Text>
        </TouchableOpacity>
      ) : null}

      {guideVisible ? (
        <View style={styles.guide}>
          <View style={styles.guideHeader}>
            <Text style={styles.guideTitle}>{copy.guideHeading}</Text>
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.close} onPress={() => setGuideVisible(false)}>
              <Text style={styles.closeText}>{copy.close}</Text>
            </TouchableOpacity>
          </View>
          <Text style={styles.text}>{copy.supportText}</Text>
          <Text style={styles.note}>{copy.bridgeText}</Text>
          <View style={styles.tabs}>
            {(["android", "ios", "computer"] as InstallTab[]).map((nextTab) => (
              <TouchableOpacity
                key={nextTab}
                accessibilityRole="tab"
                accessibilityState={{ selected: tab === nextTab }}
                style={[styles.tab, tab === nextTab && styles.tabActive]}
                onPress={() => setTab(nextTab)}
              >
                <Text style={[styles.tabText, tab === nextTab && styles.tabTextActive]}>
                  {nextTab === "android" ? copy.android : nextTab === "ios" ? copy.ios : copy.computer}
                </Text>
              </TouchableOpacity>
            ))}
          </View>
          <ScrollView style={styles.steps} nestedScrollEnabled>
            <Text style={styles.stepTitle}>{activeTitle}</Text>
            {activeSteps.map((step, index) => (
              <Text key={step} style={styles.stepText}>{`${index + 1}. ${step}`}</Text>
            ))}
            {tab === "ios" ? (
              <>
                <Text style={styles.note}>{copy.iosNote}</Text>
                <Text style={styles.note}>{copy.iosBrowserNote}</Text>
              </>
            ) : null}
            {installEvent && tab !== "ios" ? (
              <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.installNow} style={styles.primaryWide} onPress={installNow}>
                <Text style={styles.primaryText}>{copy.installNow}</Text>
              </TouchableOpacity>
            ) : (
              <Text style={styles.note}>{copy.promptUnavailable}</Text>
            )}
            {pushMessage ? <Text style={styles.note}>{pushMessage}</Text> : null}
            <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.notifications} style={styles.secondary} onPress={enablePushNotifications}>
              <Text style={styles.secondaryText}>{copy.notifications}</Text>
            </TouchableOpacity>
          </ScrollView>
        </View>
      ) : null}

      {updateReady ? (
        <View style={styles.updateCard}>
          <Text style={styles.title}>{copy.updateTitle}</Text>
          <Text style={styles.text}>{copy.updateText}</Text>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={copy.updateNow} style={styles.primary} onPress={applyUpdate}>
            <Text style={styles.primaryText}>{copy.updateNow}</Text>
          </TouchableOpacity>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  shell: {
    position: "absolute",
    left: 12,
    right: 12,
    bottom: 12,
    zIndex: 9999,
    gap: 8,
  },
  card: {
    backgroundColor: "#ffffff",
    borderColor: "#99f6e4",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    shadowColor: "#000",
    shadowOpacity: 0.12,
    shadowRadius: 12,
    flexDirection: "row",
    gap: 10,
    alignItems: "center",
  },
  guide: {
    maxHeight: 560,
    backgroundColor: "#ffffff",
    borderColor: "#0f766e",
    borderWidth: 1,
    borderRadius: 8,
    padding: 14,
    shadowColor: "#000",
    shadowOpacity: 0.18,
    shadowRadius: 16,
  },
  guideHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 12, marginBottom: 8 },
  guideTitle: { flex: 1, fontWeight: "900", color: "#0f766e", fontSize: 18 },
  closeText: { color: "#1166ff", fontWeight: "900" },
  updateCard: {
    backgroundColor: "#eff6ff",
    borderColor: "#93c5fd",
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 8,
  },
  copy: { flex: 1 },
  kicker: { color: "#f97316", fontWeight: "900", marginBottom: 2 },
  title: { fontWeight: "900", color: "#0f766e" },
  text: { color: "#334155", marginTop: 3, lineHeight: 18 },
  note: { color: "#7c2d12", marginTop: 8, lineHeight: 18 },
  actions: { gap: 6, maxWidth: 180 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 12, marginBottom: 8 },
  tab: { borderColor: "#cbd5e1", borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10 },
  tabActive: { backgroundColor: "#0f766e", borderColor: "#0f766e" },
  tabText: { color: "#334155", fontWeight: "900" },
  tabTextActive: { color: "#fff" },
  steps: { maxHeight: 330 },
  stepTitle: { fontWeight: "900", color: "#111827", marginBottom: 6 },
  stepText: { color: "#334155", lineHeight: 20, marginBottom: 4 },
  primary: { backgroundColor: "#0f766e", borderRadius: 8, paddingVertical: 9, paddingHorizontal: 12 },
  primaryWide: { backgroundColor: "#0f766e", borderRadius: 8, paddingVertical: 11, paddingHorizontal: 12, marginTop: 10 },
  primaryText: { color: "#fff", fontWeight: "900", textAlign: "center" },
  secondary: { borderColor: "#0f766e", borderWidth: 1, borderRadius: 8, paddingVertical: 8, paddingHorizontal: 10, marginTop: 10 },
  secondaryText: { color: "#0f766e", fontWeight: "900", textAlign: "center" },
  later: { paddingVertical: 6 },
  laterText: { color: "#64748b", fontWeight: "800", textAlign: "center" },
  openButton: { alignSelf: "flex-end", backgroundColor: "#0f766e", borderRadius: 8, paddingVertical: 10, paddingHorizontal: 14 },
});

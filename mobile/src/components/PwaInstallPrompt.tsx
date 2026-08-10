import React, { useEffect, useState } from "react";
import { StyleSheet, Text, TouchableOpacity, View, Platform } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useLanguage } from "../providers/LanguageProvider";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

export default function PwaInstallPrompt() {
  const { language } = useLanguage();
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isVisible, setIsVisible] = useState<boolean>(false);

  useEffect(() => {
    if (Platform.OS !== "web" || typeof window === "undefined") return;

    const handleBeforeInstallPrompt = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e as BeforeInstallPromptEvent);
      setIsVisible(true);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    };
  }, []);

  const handleInstallClick = async () => {
    if (!deferredPrompt) return;
    await deferredPrompt.prompt();
    const choiceResult = await deferredPrompt.userChoice;
    if (choiceResult.outcome === "accepted") {
      console.log("User accepted the PWA install prompt");
    }
    setDeferredPrompt(null);
    setIsVisible(false);
  };

  const handleDismiss = () => {
    setIsVisible(false);
  };

  if (!isVisible) return null;

  // Clean localized string fallbacks with UTF-8 encoding
  const getLocalizedText = () => {
    switch (language) {
      case "hi":
        return {
          title: "सबसेवा लोकल ऐप इंस्टॉल करें",
          description: "बिना डाउनलोड किए तेज़ ऑर्डर और नोटिफिकेशन के लिए अपने फोन की होम स्क्रीन पर जोड़ें।",
          installBtn: "अभी जोड़ें",
          dismissBtn: "बाद में",
        };
      case "kn":
        return {
          title: "ಸಬ್‌ಸೇವಾ ಲೋಕಲ್ ಆಪ್ ಇನ್‌ಸ್ಟಾಲ್ ಮಾಡಿ",
          description: "ವೇಗದ ಆರ್ಡರ್ ಮತ್ತು ಅಧಿಸೂಚನೆಗಳಿಗಾಗಿ ನಿಮ್ಮ ಮುಖಪುಟಕ್ಕೆ ಸೇರಿಸಿ.",
          installBtn: "ಈಗ ಸೇರಿಸಿ",
          dismissBtn: "ನಂತರ",
        };
      default:
        return {
          title: "Install SabSewa Local App",
          description: "Add to your home screen for instant orders, faster loading, and order status notifications.",
          installBtn: "Install Now",
          dismissBtn: "Not Now",
        };
    }
  };

  const text = getLocalizedText();

  return (
    <View style={styles.container}>
      <View style={styles.iconContainer}>
        <Ionicons name="phone-portrait-outline" size={28} color="#0f766e" />
      </View>

      <View style={styles.textContainer}>
        <Text style={styles.title}>{text.title}</Text>
        <Text style={styles.description}>{text.description}</Text>
        <View style={styles.buttonRow}>
          <TouchableOpacity style={styles.installButton} onPress={handleInstallClick}>
            <Text style={styles.installButtonText}>{text.installBtn}</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.dismissButton} onPress={handleDismiss}>
            <Text style={styles.dismissButtonText}>{text.dismissBtn}</Text>
          </TouchableOpacity>
        </View>
      </View>

      <TouchableOpacity style={styles.closeIcon} onPress={handleDismiss}>
        <Ionicons name="close" size={20} color="#64748b" />
      </TouchableOpacity>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flexDirection: "row",
    backgroundColor: "#ffffff",
    borderRadius: 12,
    padding: 14,
    marginHorizontal: 16,
    marginVertical: 10,
    borderWidth: 1,
    borderColor: "#0f766e",
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
    alignItems: "flex-start",
    position: "relative",
  },
  iconContainer: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: "#ccfbf1",
    alignItems: "center",
    justifyContent: "center",
    marginRight: 12,
  },
  textContainer: {
    flex: 1,
  },
  title: {
    fontSize: 15,
    fontWeight: "800",
    color: "#0f766e",
    marginBottom: 4,
  },
  description: {
    fontSize: 12,
    color: "#475569",
    lineHeight: 18,
    marginBottom: 10,
  },
  buttonRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  installButton: {
    backgroundColor: "#0f766e",
    paddingVertical: 6,
    paddingHorizontal: 14,
    borderRadius: 6,
  },
  installButtonText: {
    color: "#ffffff",
    fontWeight: "700",
    fontSize: 12,
  },
  dismissButton: {
    paddingVertical: 6,
    paddingHorizontal: 10,
  },
  dismissButtonText: {
    color: "#64748b",
    fontWeight: "600",
    fontSize: 12,
  },
  closeIcon: {
    padding: 2,
    marginLeft: 6,
  },
});
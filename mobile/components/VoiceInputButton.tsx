import React, { useState, useEffect, useRef } from 'react';
import { StyleSheet, TouchableOpacity, Text, View, Alert, Platform, Modal, ActivityIndicator, Vibration, TextInput } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { useLanguage } from '@/providers/LanguageProvider';

// PREREQUISITE: npx expo install @react-native-voice/voice (must be run inside /mobile)
let NativeVoice: any;
if (Platform.OS === 'ios' || Platform.OS === 'android') {
  NativeVoice = require('@react-native-voice/voice').default;
}

// Check for Web Speech API support
const isNative = Platform.OS === 'ios' || Platform.OS === 'android';
const SpeechRecognition = Platform.OS === 'web' && typeof window !== 'undefined' ? (window.SpeechRecognition || window.webkitSpeechRecognition) : null;

// Map SabSewa Local languages to standard locale codes for Speech Engines
const langMap = {
  en: 'en-IN',
  hi: 'hi-IN',
  kn: 'kn-IN',
};

interface VoiceInputButtonProps {
  onTranscript: (transcript: string) => void; // Standard text return
  onStructuredResult?: (result: any) => void; // Optional: For structured cart/address data from Gemini
  fieldLabel: string;
  multiline?: boolean;
  context?: 'text_only' | 'shopping_cart' | 'address';
  vendorId?: string; // Required for 'shopping_cart' context to query catalogue
}

export default function VoiceInputButton({ onTranscript, onStructuredResult, fieldLabel, multiline, context = 'text_only', vendorId }: VoiceInputButtonProps) {
  const { lang, t } = useLanguage();
  const [isListening, setIsListening] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);
  const [transcript, setTranscript] = useState('');
  const [processing, setProcessing] = useState(false);
  
  const recognitionRef = useRef<any>(null); // For Web API reference
  const speechLocale = langMap[lang as keyof typeof langMap] || 'en-IN';

  // --- PLATFORM AGNOSTIC LOGIC ---

  useEffect(() => {
    if (!isNative && SpeechRecognition) {
      // Setup Web SpeechRecognition instance for Desktop & PWA Browsers
      const recognition = new SpeechRecognition();
      recognition.continuous = multiline;
      recognition.interimResults = true;
      recognition.lang = speechLocale;
      
      recognition.onresult = (event: any) => {
        const finalTranscript = Array.from(event.results)
          .map((result: any) => result[0])
          .map((result: any) => result.transcript)
          .join(' ');
          
        setTranscript(finalTranscript);
      };
      
      recognition.onerror = (event: any) => {
        console.error('Speech Recognition Error (Web):', event.error);
        setIsListening(false);
        if (event.error !== 'no-speech') Alert.alert(t('error.voice_title'), t(`error.voice_${event.error}`));
      };
      
      recognition.onend = () => {
        if (isListening && !multiline) stopListening(); // Stop cleanly after single phrase if not multiline
      };
      
      recognitionRef.current = recognition;
    }

    return () => {
      // Cleanup native listeners or web refs
      if (isNative && NativeVoice) {
        NativeVoice.destroy().then(NativeVoice.removeAllListeners);
      } else if (recognitionRef.current) {
        recognitionRef.current.abort();
      }
    };
  }, [lang, multiline]);

  const startListening = async () => {
    setTranscript('');
    setProcessing(false);

    try {
      if (isNative) {
        // NATIVE MOBILE LISTENERS & PERMISSIONS
        // await requestMicrophonePermission(); // (stub: add Audio permissions check)
        
        // NativeVoice.onSpeechStart = () => setIsListening(true);
        // NativeVoice.onSpeechEnd = () => setIsListening(false);
        // NativeVoice.onSpeechResults = (e: any) => {
        //   if (e.value) setTranscript(e.value[0]);
        // };
        // NativeVoice.onSpeechError = (e: any) => {
        //    Alert.alert(t('error.voice_start'), e.error.message);
        //    setIsListening(false);
        // };

        // await NativeVoice.start(speechLocale);
        Alert.alert("Native Voice Stubs", "Configure listeners for @react-native-voice/voice here.");
      } else if (recognitionRef.current) {
        // WEB SPEECH API
        recognitionRef.current.start();
      }
      
      setIsListening(true);
      if (Platform.OS !== 'web') Vibration.vibrate(50); // Accessible feedback
    } catch (err: any) {
      console.error('Voice Start Error:', err);
      Alert.alert(t('error.voice_start'), err.message);
    }
  };

  const stopListening = async () => {
    setIsListening(false);
    try {
      if (isNative) {
        // await NativeVoice.stop();
      } else if (recognitionRef.current) {
        recognitionRef.current.stop();
      }
      
      // If we captured any text, show the Multilingual Confirmation matrix
      if (transcript.trim()) {
        setShowConfirm(true);
      }
    } catch (err) {
      console.error('Voice Stop Error:', err);
    }
  };

  // --- CONFIRMATION & GEMINI FLASH PROCESSING ---

  const handleConfirmRaw = () => {
    if (context === 'text_only') {
      onTranscript(transcript); // Insert standard text
      resetState();
    } else {
      processWithGemini(); // Trigger cart structuring matrix
    }
  };

  const processWithGemini = async () => {
    if (!transcript.trim()) return resetState();
    if (context === 'shopping_cart' && !vendorId) {
      return Alert.alert("Internal Error", "Vendor ID required for shopping cart voice context.");
    }
    
    setProcessing(true);
    try {
      // BACKEND SECURE CALL (Requires Gemini API deployment)
      // const response = await fetch(apiUrl('/api/ai/voice-to-cart'), {
      //   method: 'POST',
      //   headers: { 'Content-Type': 'application/json' },
      //   body: JSON.stringify({ raw_transcript: transcript, lang, context, vendor_id: vendorId })
      // });
      
      // Stub output simulation for demonstration
      setTimeout(() => {
        onTranscript(`Structured from Gemini: ${transcript}`); // Return a placeholder string
        if (onStructuredResult) onStructuredResult({ product: 'Example', quantity: 2 }); // Placeholder result
        setProcessing(false);
        setShowConfirm(false);
        resetState();
      }, 1500);

    } catch (err) {
      setProcessing(false);
      Alert.alert(t('error.ai_processing'), "Unable to parse order request. Please try again.");
    }
  };

  const resetState = () => {
    setTranscript('');
    setShowConfirm(false);
    setProcessing(false);
    setIsListening(false);
  }

  // --- RENDER ---

  // Handle unsupported browsers gracefully
  if (Platform.OS === 'web' && !SpeechRecognition) {
    return <Ionicons name="mic-off" size={20} color="#cbd5e1" title="Voice Input not supported in this browser" />;
  }

  return (
    <View style={styles.container}>
      <TouchableOpacity 
        style={[styles.micBtn, isListening && styles.micListening]} 
        onPress={isListening ? stopListening : startListening}
        accessibilityLabel={`${t('accessibility.voice_input_for')} ${fieldLabel}`}
        accessibilityState={{ busy: isListening }}
        accessibilityRole="button"
      >
        <Ionicons name={isListening ? "stop" : "mic"} size={20} color={isListening ? "#dc2626" : "#475569"} />
      </TouchableOpacity>

      {/* MULTILINGUAL CONFIRMATION MATRIX (Bottom Sheet/Modal) */}
      <Modal animationType="slide" transparent={true} visible={showConfirm} onRequestClose={resetState}>
        <View style={styles.modalOverlay}>
          <View style={styles.confirmationCard}>
            <Text style={styles.sectionTitle}>
              {t('voice.we_understood')} ({langMap[lang as keyof typeof langMap]})
            </Text>
            
            {processing ? (
              <View style={styles.processing}>
                <ActivityIndicator size="large" color="#0f766e" />
                <Text style={styles.bodyText}>{t('voice.processing_order')}</Text>
              </View>
            ) : (
              // Display Hindi/Kannada in native scripts for review/editing
              <TextInput
                style={styles.transcriptText}
                multiline
                value={transcript}
                onChangeText={setTranscript} // Critical Requirement: Allow manual editing
                accessibilityLabel="Transcribed text"
              />
            )}

            {!processing && (
              <View style={styles.confirmActions}>
                <ActionBtn label={t('voice.speak_again')} icon="mic" color="#dc2626" onPress={startListening} />
                <ActionBtn label={t('voice.confirm')} icon="checkmark" color="#16a34a" onPress={handleConfirmRaw} />
              </View>
            )}
            
            {!processing && (
              <TouchableOpacity style={styles.closeBtn} onPress={resetState}>
                <Text style={styles.closeText}>{t('common.cancel')}</Text>
              </TouchableOpacity>
            )}
          </View>
        </View>
      </Modal>
    </View>
  );
}

const ActionBtn = ({ label, icon, color, onPress }: any) => (
  <TouchableOpacity style={[styles.actionButton, { borderColor: color }]} onPress={onPress}>
    <Ionicons name={icon} size={18} color={color} />
    <Text style={[styles.actionLabel, { color }]}>{label}</Text>
  </TouchableOpacity>
);

const styles = StyleSheet.create({
  container: { justifyContent: 'center' },
  micBtn: { padding: 10 },
  micListening: { backgroundColor: '#fee2e2', borderRadius: 99 },
  
  modalOverlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.5)', justifyContent: 'flex-end' },
  confirmationCard: { backgroundColor: '#ffffff', padding: 24, borderTopLeftRadius: 20, borderTopRightRadius: 20, elevation: 5 },
  
  sectionTitle: { color: '#64748b', fontSize: 13, fontWeight: '800', marginBottom: 10, textTransform: 'uppercase' },
  processing: { padding: 20, alignItems: 'center' },
  transcriptText: { backgroundColor: '#f1f5f9', borderWidth: 1, borderColor: '#cbd5e1', borderRadius: 8, padding: 14, color: '#0f172a', fontWeight: '900', fontSize: 16, textAlign: 'center', marginBottom: 20, minHeight: 60, textAlignVertical: 'top' },
  bodyText: { color: '#334155', lineHeight: 21, marginTop: 10 },
  
  confirmActions: { flexDirection: 'row', gap: 12 },
  actionButton: { flex: 1, flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, borderWidth: 1, padding: 12, borderRadius: 8 },
  actionLabel: { fontWeight: '900', fontSize: 14 },
  
  closeBtn: { marginTop: 20, padding: 10, alignItems: 'center' },
  closeText: { color: '#64748b', fontWeight: '800' },
});
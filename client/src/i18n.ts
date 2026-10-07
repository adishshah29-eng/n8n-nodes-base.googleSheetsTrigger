export type Lang = 'sat' | 'hi' | 'en';

export const strings = {
  en: {
    passedTitle: 'Well done!',
    passedMsg: 'You passed this scenario.',
    failedTitle: 'Not passed yet',
    failedMsg: 'No problem. Try again.',
    criticalTitle: 'Critical mistake',
    criticalMsg: 'On a real site this could have cost a life. Learn from it and try again.',
    score: 'Score',
    certPending: 'Certificate after sync',
    certPendingNote: 'Your result is saved on this phone. Connect to the internet and your certificate will appear.',
    syncing: 'Syncing…',
    viewCert: 'View certificate',
    tryAgain: 'Try again',
    home: 'Home',
    notFound: 'Result not found',
    tapAgain: 'Tap again to choose',
    timeUp: 'Time is up. Try again.',
    wrongPart: 'Not that one. Follow the order.',
    pointAtSign: 'Point the camera at the sign',
    stepDone: 'Done',
    loading: 'Loading…',
    chooseLanguage: 'Choose your language',
    continue: 'Continue',
    enrollTitle: 'Your details',
    name: 'Name',
    employerId: 'Employer ID',
    site: 'Mine / site',
    siteNone: 'Select site',
    photo: 'Your photo',
    takePhoto: 'Take photo',
    retakePhoto: 'Retake photo',
    enroll: 'Register',
    enrolling: 'Registering…',
    needOnline: 'Connect to the internet to register. You only need to do this once.',
    enrollFailed: 'Could not register. Check your details and try again.',
    needAll: 'Please fill in your name and employer ID and take a photo.',
    hello: 'Hello',
    scenarios: 'Practice scenarios',
    readyOffline: 'Ready offline',
    preparingOffline: 'Getting ready for offline use…',
    notReadyOffline: 'Not ready offline yet. Stay connected.',
    waitingToSync: 'results waiting to sync',
    start: 'Start',
    done: 'Passed',
    myCertificate: 'My certificate',
  },
  hi: {
    passedTitle: 'बहुत बढ़िया!',
    passedMsg: 'आपने यह अभ्यास पास कर लिया।',
    failedTitle: 'अभी पास नहीं हुए',
    failedMsg: 'कोई बात नहीं। फिर से कोशिश करें।',
    criticalTitle: 'गंभीर गलती',
    criticalMsg: 'असली जगह पर इससे जान जा सकती थी। इससे सीखें और दोबारा कोशिश करें।',
    score: 'अंक',
    certPending: 'सिंक के बाद प्रमाणपत्र मिलेगा',
    certPendingNote: 'आपका नतीजा इस फ़ोन में सुरक्षित है। इंटरनेट से जुड़ते ही प्रमाणपत्र दिखेगा।',
    syncing: 'सिंक हो रहा है…',
    viewCert: 'प्रमाणपत्र देखें',
    tryAgain: 'फिर से कोशिश करें',
    home: 'होम',
    notFound: 'नतीजा नहीं मिला',
    tapAgain: 'चुनने के लिए दोबारा दबाएँ',
    timeUp: 'समय खत्म। फिर से कोशिश करें।',
    wrongPart: 'यह नहीं। क्रम का पालन करें।',
    pointAtSign: 'कैमरा बोर्ड की ओर करें',
    stepDone: 'हो गया',
    loading: 'लोड हो रहा है…',
    chooseLanguage: 'अपनी भाषा चुनें',
    continue: 'आगे बढ़ें',
    enrollTitle: 'आपकी जानकारी',
    name: 'नाम',
    employerId: 'कर्मचारी आईडी',
    site: 'खदान / साइट',
    siteNone: 'साइट चुनें',
    photo: 'आपकी फ़ोटो',
    takePhoto: 'फ़ोटो लें',
    retakePhoto: 'फ़ोटो दोबारा लें',
    enroll: 'रजिस्टर करें',
    enrolling: 'रजिस्टर हो रहा है…',
    needOnline: 'रजिस्टर करने के लिए इंटरनेट से जुड़ें। यह सिर्फ़ एक बार करना है।',
    enrollFailed: 'रजिस्टर नहीं हो सका। जानकारी जाँचें और फिर कोशिश करें।',
    needAll: 'कृपया नाम, कर्मचारी आईडी भरें और फ़ोटो लें।',
    hello: 'नमस्ते',
    scenarios: 'अभ्यास',
    readyOffline: 'बिना इंटरनेट के तैयार',
    preparingOffline: 'बिना इंटरनेट के उपयोग के लिए तैयार हो रहा है…',
    notReadyOffline: 'अभी बिना इंटरनेट के तैयार नहीं है। जुड़े रहें।',
    waitingToSync: 'नतीजे सिंक होने बाकी हैं',
    start: 'शुरू करें',
    done: 'पास',
    myCertificate: 'मेरा प्रमाणपत्र',
  },
} satisfies Record<'en' | 'hi', Record<string, string>>;

export type StringKey = keyof (typeof strings)['en'];

/**
 * Santali text needs a native speaker (Ol Chiki script), so until it exists the
 * Santali UI falls back to Hindi, matching the plan's "ship Hindi" fallback.
 */
export function t(lang: Lang, key: StringKey): string {
  return strings[lang === 'en' ? 'en' : 'hi'][key];
}

/** Fills `{n}`-style placeholders. */
export const fill = (text: string, vars: Record<string, string | number>) =>
  text.replace(/\{(\w+)\}/g, (_, k) => String(vars[k] ?? ''));

import type { Localized } from './engine/types';

/** Picks the text for a language: Santali falls back to Hindi (no native text yet), then English. */
export const loc = (text: Localized | undefined, lang: Lang): string =>
  (lang === 'en' ? text?.en : (text?.[lang] ?? text?.hi)) ?? text?.en ?? '';

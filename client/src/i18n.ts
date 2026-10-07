export type Lang = 'sat' | 'hi' | 'en';

const strings = {
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

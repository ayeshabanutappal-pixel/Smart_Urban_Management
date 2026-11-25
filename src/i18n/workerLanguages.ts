export interface WorkerLanguageMeta {
  code: string;
  englishName: string;
  nativeName: string;
  bcp47: string;
}

export interface WorkerUiStrings {
  portalTitle: string;
  myTasks: string;
  inProgress: string;
  pendingVerification: string;
  completedTasks: string;
  startTask: string;
  starting: string;
  uploadAfterPhoto: string;
  takePhotoCamera: string;
  choosePhotoFile: string;
  completionNotesLabel: string;
  completionNotesPlaceholder: string;
  submitCompletion: string;
  submitting: string;
  awaitingAdminReview: string;
  completedBadge: string;
  beforePhoto: string;
  afterPhoto: string;
  openMap: string;
  listen: string;
  stopAudio: string;
  audioOn: string;
  audioOff: string;
  chooseLanguage: string;
  searchLanguage: string;
  rejectedBannerTitle: string;
  noTasksHere: string;
  logout: string;
  locationLabel: string;
  categoryLabel: string;
  aiConfidenceLabel: string;
  refresh: string;
}

/**
 * English + all 22 Scheduled Languages of India (Eighth Schedule).
 */
export const WORKER_LANGUAGES: WorkerLanguageMeta[] = [
  { code: 'en', englishName: 'English', nativeName: 'English', bcp47: 'en-IN' },
  { code: 'hi', englishName: 'Hindi', nativeName: 'हिन्दी', bcp47: 'hi-IN' },
  { code: 'ta', englishName: 'Tamil', nativeName: 'தமிழ்', bcp47: 'ta-IN' },
  { code: 'te', englishName: 'Telugu', nativeName: 'తెలుగు', bcp47: 'te-IN' },
  { code: 'kn', englishName: 'Kannada', nativeName: 'ಕನ್ನಡ', bcp47: 'kn-IN' },
  { code: 'ml', englishName: 'Malayalam', nativeName: 'മലയാളം', bcp47: 'ml-IN' },
  { code: 'mr', englishName: 'Marathi', nativeName: 'मराठी', bcp47: 'mr-IN' },
  { code: 'bn', englishName: 'Bengali', nativeName: 'বাংলা', bcp47: 'bn-IN' },
  { code: 'gu', englishName: 'Gujarati', nativeName: 'ગુજરાતી', bcp47: 'gu-IN' },
  { code: 'pa', englishName: 'Punjabi', nativeName: 'ਪੰਜਾਬੀ', bcp47: 'pa-IN' },
  { code: 'or', englishName: 'Odia', nativeName: 'ଓଡ଼ିଆ', bcp47: 'or-IN' },
  { code: 'as', englishName: 'Assamese', nativeName: 'অসমীয়া', bcp47: 'as-IN' },
  { code: 'ur', englishName: 'Urdu', nativeName: 'اردو', bcp47: 'ur-IN' },
  { code: 'ne', englishName: 'Nepali', nativeName: 'नेपाली', bcp47: 'ne-IN' },
  { code: 'kok', englishName: 'Konkani', nativeName: 'कोंकणी', bcp47: 'kok-IN' },
  { code: 'mai', englishName: 'Maithili', nativeName: 'मैथिली', bcp47: 'mai-IN' },
  { code: 'doi', englishName: 'Dogri', nativeName: 'डोगरी', bcp47: 'doi-IN' },
  { code: 'brx', englishName: 'Bodo', nativeName: 'बड़ो', bcp47: 'brx-IN' },
  { code: 'sa', englishName: 'Sanskrit', nativeName: 'संस्कृतम्', bcp47: 'sa-IN' },
  { code: 'sat', englishName: 'Santali', nativeName: 'ᱥᱟᱱᱛᱟᱲᱤ', bcp47: 'sat-IN' },
  { code: 'ks', englishName: 'Kashmiri', nativeName: 'कॉशुर / کٲشُر', bcp47: 'ks-IN' },
  { code: 'mni', englishName: 'Manipuri (Meitei)', nativeName: 'মৈতৈলোন্', bcp47: 'mni-IN' },
  { code: 'sd', englishName: 'Sindhi', nativeName: 'सिन्धी / سنڌي', bcp47: 'sd-IN' },
];

const EN_STRINGS: WorkerUiStrings = {
  portalTitle: 'Field Worker Tasks',
  myTasks: 'My Tasks',
  inProgress: 'In Progress',
  pendingVerification: 'Pending Review',
  completedTasks: 'Completed',
  startTask: 'Start Task',
  starting: 'Starting...',
  uploadAfterPhoto: 'After-Cleaning Photo',
  takePhotoCamera: 'Take Photo',
  choosePhotoFile: 'Upload Photo',
  completionNotesLabel: 'Short Notes (optional)',
  completionNotesPlaceholder: 'e.g. Area swept and waste loaded onto truck',
  submitCompletion: 'Submit Completion',
  submitting: 'Submitting...',
  awaitingAdminReview: 'Sent for Admin Verification',
  completedBadge: 'Verified & Completed',
  beforePhoto: 'Before Photo',
  afterPhoto: 'After Photo',
  openMap: 'Open Map',
  listen: 'Listen',
  stopAudio: 'Stop',
  audioOn: 'Voice On',
  audioOff: 'Voice Off',
  chooseLanguage: 'Language',
  searchLanguage: 'Search all 23 languages...',
  rejectedBannerTitle: 'Returned by Admin — Rework Needed:',
  noTasksHere: 'No tasks in this section yet.',
  logout: 'Sign Out',
  locationLabel: 'Location',
  categoryLabel: 'Waste',
  aiConfidenceLabel: 'AI Match',
  refresh: 'Refresh',
};

const TRANSLATIONS: Record<string, Partial<WorkerUiStrings>> = {
  en: EN_STRINGS,
  hi: {
    portalTitle: 'सफाई कर्मी कार्य',
    myTasks: 'मेरे कार्य',
    inProgress: 'प्रगति पर',
    pendingVerification: 'सत्यापन बाकी',
    completedTasks: 'पूर्ण कार्य',
    startTask: 'कार्य शुरू करें',
    starting: 'शुरू हो रहा है...',
    uploadAfterPhoto: 'सफाई के बाद की फोटो',
    takePhotoCamera: 'कैमरे से फोटो लें',
    choosePhotoFile: 'गैलरी से चुनें',
    completionNotesLabel: 'संक्षिप्त नोट (वैकल्पिक)',
    completionNotesPlaceholder: 'उदा. कचरा साफ कर दिया गया',
    submitCompletion: 'कार्य जमा करें',
    submitting: 'जमा हो रहा है...',
    awaitingAdminReview: 'एडमिन जांच के लिए भेजा गया',
    completedBadge: 'सत्यापित व पूर्ण',
    beforePhoto: 'पहले की फोटो',
    afterPhoto: 'बाद की फोटो',
    openMap: 'मैप खोलें',
    listen: 'सुनें',
    stopAudio: 'रोकें',
    audioOn: 'आवाज़ चालू',
    audioOff: 'आवाज़ बंद',
    chooseLanguage: 'भाषा',
    searchLanguage: 'भाषा खोजें (23 भाषाएँ)...',
    rejectedBannerTitle: 'एडमिन द्वारा लौटाया गया — सुधार आवश्यक:',
    noTasksHere: 'इस श्रेणी में अभी कोई कार्य नहीं है।',
    logout: 'लॉग आउट',
    locationLabel: 'स्थान',
    categoryLabel: 'कचरा',
    aiConfidenceLabel: 'AI मिलान',
    refresh: 'ताज़ा करें',
  },
  ta: {
    portalTitle: 'பணியாளர் பணிகள்',
    myTasks: 'என் பணிகள்',
    inProgress: 'நடைபெறுகிறது',
    pendingVerification: 'சரிபார்ப்பு நிலுவை',
    completedTasks: 'முடிந்தவை',
    startTask: 'பணியைத் தொடங்கு',
    starting: 'தொடங்குகிறது...',
    uploadAfterPhoto: 'சுத்தம் செய்த பின் படம்',
    takePhotoCamera: 'படம் எடு',
    choosePhotoFile: 'படம் பதிவேற்று',
    completionNotesLabel: 'குறிப்பு (விருப்பம்)',
    completionNotesPlaceholder: 'எ.கா. குப்பை அகற்றப்பட்டது',
    submitCompletion: 'பணியைச் சமர்ப்பி',
    submitting: 'சமர்ப்பிக்கிறது...',
    awaitingAdminReview: 'நிர்வாக சரிபார்ப்பிற்கு அனுப்பப்பட்டது',
    completedBadge: 'சரிபார்க்கப்பட்டது',
    beforePhoto: 'முன்பு',
    afterPhoto: 'பின்பு',
    openMap: 'வரைபடம்',
    listen: 'கேள்',
    stopAudio: 'நிறுத்து',
    audioOn: 'குரல் ஆன்',
    audioOff: 'குரல் ஆஃப்',
    chooseLanguage: 'மொழி',
    searchLanguage: 'மொழியைத் தேடு...',
    rejectedBannerTitle: 'மீண்டும் செய்ய வேண்டும்:',
    noTasksHere: 'இங்கே பணிகள் இல்லை.',
    logout: 'வெளியேறு',
    locationLabel: 'இடம்',
    categoryLabel: 'குப்பை',
    refresh: 'புதுப்பி',
  },
  te: {
    portalTitle: 'కార్మికుల పనులు',
    myTasks: 'నా పనులు',
    inProgress: 'కొనసాగుతోంది',
    pendingVerification: 'పరిశీలనలో ఉంది',
    completedTasks: 'పూర్తయినవి',
    startTask: 'పని ప్రారంభించు',
    starting: 'ప్రారంభమవుతోంది...',
    uploadAfterPhoto: 'శుభ్రం చేసిన తర్వాత ఫోటో',
    takePhotoCamera: 'ఫోటో తీయండి',
    choosePhotoFile: 'ఫోటో అప్‌లోడ్',
    completionNotesLabel: 'చిన్న నోట్ (ఐచ్ఛికం)',
    completionNotesPlaceholder: 'ఉదా. చెత్త తొలగించబడింది',
    submitCompletion: 'పూర్తయినట్లు సమర్పించు',
    submitting: 'సమర్పిస్తోంది...',
    awaitingAdminReview: 'అడ్మిన్ పరిశీలనకు పంపబడింది',
    completedBadge: 'ఆమోదించబడింది',
    beforePhoto: 'ముందు ఫోటో',
    afterPhoto: 'తర్వాత ఫోటో',
    openMap: 'మ్యాప్',
    listen: 'వినండి',
    stopAudio: 'ఆపండి',
    audioOn: 'వాయిస్ ఆన్',
    audioOff: 'వాయిస్ ఆఫ్',
    chooseLanguage: 'భాష',
    searchLanguage: 'భాష వెతకండి...',
    rejectedBannerTitle: 'మళ్ళీ శుభ్రం చేయాలి:',
    noTasksHere: 'ఈ విభాగంలో పనులు లేవు.',
    logout: 'లాగ్ అవుట్',
    locationLabel: 'ప్రదేశం',
    categoryLabel: 'చెత్త',
    refresh: 'రిఫ్రెష్',
  },
  kn: {
    portalTitle: 'ಕಾರ್ಮಿಕರ ಕೆಲಸಗಳು',
    myTasks: 'ನನ್ನ ಕೆಲಸಗಳು',
    inProgress: 'ಪ್ರಗತಿಯಲ್ಲಿದೆ',
    pendingVerification: 'ಪರಿಶೀಲನೆ ಬಾಕಿ',
    completedTasks: 'ಪೂರ್ಣಗೊಂಡಿದೆ',
    startTask: 'ಕೆಲಸ ಪ್ರಾರಂಭಿಸಿ',
    starting: 'ಪ್ರಾರಂಭವಾಗುತ್ತಿದೆ...',
    uploadAfterPhoto: 'ಸ್ವಚ್ಛಗೊಳಿಸಿದ ನಂತರದ ಫೋಟೋ',
    takePhotoCamera: 'ಫೋಟೋ ತೆಗೆಯಿರಿ',
    choosePhotoFile: 'ಫೋಟೋ ಅಪ್‌ಲೋಡ್',
    completionNotesLabel: 'ಟಿಪ್ಪಣಿ (ಐಚ್ಛಿಕ)',
    submitCompletion: 'ಕೆಲಸ ಸಲ್ಲಿಸಿ',
    submitting: 'ಸಲ್ಲಿಸಲಾಗುತ್ತಿದೆ...',
    awaitingAdminReview: 'ನಿರ್ವಾಹಕರ ಪರಿಶೀಲನೆಗೆ ಕಳುಹಿಸಲಾಗಿದೆ',
    completedBadge: 'ಪರಿಶೀಲಿಸಿ ಪೂರ್ಣಗೊಂಡಿದೆ',
    beforePhoto: 'ಮೊದಲ ಫೋಟೋ',
    afterPhoto: 'ನಂತರದ ಫೋಟೋ',
    openMap: 'ನಕ್ಷೆ ತೆರೆಯಿರಿ',
    listen: 'ಕೇಳಿ',
    stopAudio: 'ನಿಲ್ಲಿಸಿ',
    audioOn: 'ಧ್ವನಿ ಆನ್',
    audioOff: 'ಧ್ವನಿ ಆಫ್',
    chooseLanguage: 'ಭಾಷೆ',
    searchLanguage: 'ಭಾಷೆ ಹುಡುಕಿ...',
    rejectedBannerTitle: 'ಮತ್ತೆ ಸ್ವಚ್ಛಗೊಳಿಸಬೇಕು:',
    noTasksHere: 'ಇಲ್ಲಿ ಯಾವುದೇ ಕೆಲಸಗಳಿಲ್ಲ.',
    logout: 'ಲಾಗ್ ಔಟ್',
    locationLabel: 'ಸ್ಥಳ',
    categoryLabel: 'ಕಸ',
    refresh: 'ರಿಫ್ರೆಶ್',
  },
  ml: {
    portalTitle: 'തൊഴിലാളി ജോലികൾ',
    myTasks: 'എന്റെ ജോലികൾ',
    inProgress: 'പുരോഗതിയിൽ',
    pendingVerification: 'പരിശോധന കാത്തിരിക്കുന്നു',
    completedTasks: 'പൂർത്തിയായി',
    startTask: 'ജോലി തുടങ്ങുക',
    starting: 'തുടങ്ങുന്നു...',
    uploadAfterPhoto: 'വൃത്തിയാക്കിയ ശേഷമുള്ള ഫോട്ടോ',
    takePhotoCamera: 'ഫോട്ടോ എടുക്കുക',
    choosePhotoFile: 'ഫോട്ടോ അപ്‌ലോഡ്',
    submitCompletion: 'പൂർത്തിയായി സമർപ്പിക്കുക',
    awaitingAdminReview: 'അഡ്മിൻ പരിശോധനയ്ക്ക് അയച്ചു',
    completedBadge: 'പൂർത്തിയായി',
    beforePhoto: 'മുമ്പ്',
    afterPhoto: 'ശേഷം',
    openMap: 'മാപ്പ്',
    listen: 'കേൾക്കുക',
    stopAudio: 'നിർത്തുക',
    chooseLanguage: 'ഭാഷ',
    searchLanguage: 'ഭാഷ തിരയുക...',
    rejectedBannerTitle: 'വീണ്ടും വൃത്തിയാക്കേണ്ടതുണ്ട്:',
    noTasksHere: 'ഇവിടെ ജോലികളൊന്നുമില്ല.',
    logout: 'ലോഗൗട്ട്',
    locationLabel: 'സ്ഥലം',
    categoryLabel: 'മാലിന്യം',
  },
  mr: {
    portalTitle: 'स्वच्छता कर्मचारी कामे',
    myTasks: 'माझी कामे',
    inProgress: 'काम सुरू आहे',
    pendingVerification: 'पडताळणी बाकी',
    completedTasks: 'पूर्ण झालेली',
    startTask: 'काम सुरू करा',
    starting: 'सुरू होत आहे...',
    uploadAfterPhoto: 'स्वच्छतेनंतरचा फोटो',
    takePhotoCamera: 'फोटो काढा',
    choosePhotoFile: 'फोटो निवडा',
    completionNotesLabel: 'नोंद (ऐच्छिक)',
    submitCompletion: 'काम जमा करा',
    awaitingAdminReview: 'तपासणीसाठी पाठवले',
    completedBadge: 'मंजूर व पूर्ण',
    beforePhoto: 'आधीचा फोटो',
    afterPhoto: 'नंतरचा फोटो',
    openMap: 'नकाशा उघडा',
    listen: 'ऐका',
    stopAudio: 'थांबा',
    chooseLanguage: 'भाषा',
    searchLanguage: 'भाषा शोधा...',
    rejectedBannerTitle: 'पुन्हा साफसफाई आवश्यक:',
    noTasksHere: 'येथे कोणतीही कामे नाहीत.',
    logout: 'बाहेर पडा',
    locationLabel: 'ठिकाण',
    categoryLabel: 'कचरा',
  },
  bn: {
    portalTitle: 'কর্মীর কাজ',
    myTasks: 'আমার কাজ',
    inProgress: 'চলছে',
    pendingVerification: 'যাচাই বাকি',
    completedTasks: 'সম্পন্ন',
    startTask: 'কাজ শুরু করুন',
    starting: 'শুরু হচ্ছে...',
    uploadAfterPhoto: 'পরিষ্কারের পরের ছবি',
    takePhotoCamera: 'ছবি তুলুন',
    choosePhotoFile: 'ছবি আপলোড',
    completionNotesLabel: 'সংক্ষিপ্ত নোট (ঐচ্ছিক)',
    submitCompletion: 'কাজ জমা দিন',
    awaitingAdminReview: 'অ্যাডমিন যাচাইয়ের জন্য পাঠানো হয়েছে',
    completedBadge: 'অনুমোদিত ও সম্পন্ন',
    beforePhoto: 'আগের ছবি',
    afterPhoto: 'পরের ছবি',
    openMap: 'মানচিত্র দেখুন',
    listen: 'শুনুন',
    stopAudio: 'থামান',
    chooseLanguage: 'ভাষা',
    searchLanguage: 'ভাষা খুঁজুন...',
    rejectedBannerTitle: 'পুনরায় পরিষ্কার প্রয়োজন:',
    noTasksHere: 'এখানে কোনো কাজ নেই।',
    logout: 'লগ আউট',
    locationLabel: 'অবস্থান',
    categoryLabel: 'বর্জ্য',
  },
  gu: {
    portalTitle: 'કામદાર કાર્યો',
    myTasks: 'મારા કાર્યો',
    inProgress: 'ચાલુ છે',
    pendingVerification: 'ચકાસણી બાકી',
    completedTasks: 'પૂર્ણ થયેલ',
    startTask: 'કામ શરૂ કરો',
    uploadAfterPhoto: 'સફાઈ પછીનો ફોટો',
    takePhotoCamera: 'ફોટો લો',
    choosePhotoFile: 'ફોટો અપલોડ',
    submitCompletion: 'કામ સબમિટ કરો',
    awaitingAdminReview: 'એડમિન ચકાસણી માટે મોકલ્યું',
    completedBadge: 'પૂર્ણ થયેલ',
    beforePhoto: 'પહેલાં',
    afterPhoto: 'પછી',
    openMap: 'નકશો',
    listen: 'સાંભળો',
    stopAudio: 'રોકો',
    chooseLanguage: 'ભાષા',
    searchLanguage: 'ભાષા શોધો...',
    rejectedBannerTitle: 'ફરીથી સફાઈ જરૂરી:',
    noTasksHere: 'અહીં કોઈ કાર્ય નથી.',
    logout: 'લોગ આઉટ',
  },
  pa: {
    portalTitle: 'ਕਰਮਚਾਰੀ ਕੰਮ',
    myTasks: 'ਮੇਰੇ ਕੰਮ',
    inProgress: 'ਚੱਲ ਰਿਹਾ ਹੈ',
    pendingVerification: 'ਜਾਂਚ ਬਾਕੀ',
    completedTasks: 'ਮੁਕੰਮਲ',
    startTask: 'ਕੰਮ ਸ਼ੁਰੂ ਕਰੋ',
    uploadAfterPhoto: 'ਸਫਾਈ ਤੋਂ ਬਾਅਦ ਦੀ ਫੋਟੋ',
    takePhotoCamera: 'ਫੋਟੋ ਖਿੱਚੋ',
    choosePhotoFile: 'ਫੋਟੋ ਅੱਪਲੋਡ',
    submitCompletion: 'ਕੰਮ ਜਮ੍ਹਾਂ ਕਰੋ',
    awaitingAdminReview: 'ਐਡਮਿਨ ਜਾਂਚ ਲਈ ਭੇਜਿਆ ਗਿਆ',
    completedBadge: 'ਮੁਕੰਮਲ',
    beforePhoto: 'ਪਹਿਲਾਂ',
    afterPhoto: 'ਬਾਅਦ',
    openMap: 'ਨਕਸ਼ਾ',
    listen: 'ਸੁਣੋ',
    stopAudio: 'ਰੋਕੋ',
    chooseLanguage: 'ਭਾਸ਼ਾ',
    searchLanguage: 'ਭਾਸ਼ਾ ਲੱਭੋ...',
    rejectedBannerTitle: 'ਦੁਬਾਰਾ ਸਫਾਈ ਲੋੜੀਂਦੀ:',
    noTasksHere: 'ਇੱਥੇ ਕੋਈ ਕੰਮ ਨਹੀਂ ਹੈ।',
    logout: 'ਲੌਗ ਆਊਟ',
  },
  or: {
    portalTitle: 'କର୍ମଚାରୀ କାର୍ଯ୍ୟ',
    myTasks: 'ମୋ କାର୍ଯ୍ୟ',
    inProgress: 'ଚାଲିଛି',
    pendingVerification: 'ଯାଞ୍ଚ ବାକି',
    completedTasks: 'ସମ୍ପୂର୍ଣ୍ଣ',
    startTask: 'କାର୍ଯ୍ୟ ଆରମ୍ଭ କରନ୍ତୁ',
    uploadAfterPhoto: 'ସଫା ପରେ ଫଟୋ',
    submitCompletion: 'ଦାଖଲ କରନ୍ତୁ',
    chooseLanguage: 'ଭାଷା',
    logout: 'ଲଗ୍ ଆଉଟ୍',
  },
  as: {
    portalTitle: 'কৰ্মীৰ কাম',
    myTasks: 'মোৰ কাম',
    inProgress: 'চলি আছে',
    pendingVerification: 'পৰীক্ষা বাকী',
    completedTasks: 'সম্পূৰ্ণ',
    startTask: 'কাম আৰম্ভ কৰক',
    submitCompletion: 'জমা দিয়ক',
    chooseLanguage: 'ভাষা',
    logout: 'লগ আউট',
  },
  ur: {
    portalTitle: 'ورکر کے کام',
    myTasks: 'میرے کام',
    inProgress: 'جاری ہے',
    pendingVerification: 'تصدیق باقی',
    completedTasks: 'مکمل',
    startTask: 'کام شروع کریں',
    uploadAfterPhoto: 'صفائی کے بعد تصویر',
    takePhotoCamera: 'تصویر لیں',
    choosePhotoFile: 'تصویر اپ لوڈ',
    submitCompletion: 'مکمل جمع کرائیں',
    chooseLanguage: 'زبان',
    listen: 'سنیں',
    stopAudio: 'روکیں',
    logout: 'لاگ آؤٹ',
  },
  ne: {
    portalTitle: 'कर्मचारी कार्य',
    myTasks: 'मेरा कार्यहरू',
    inProgress: 'प्रगतिमा',
    pendingVerification: 'जाँच बाँकी',
    completedTasks: 'पूरा भयो',
    startTask: 'काम सुरु गर्नुहोस्',
    submitCompletion: 'बुझाउनुहोस्',
    chooseLanguage: 'भाषा',
    logout: 'लग आउट',
  },
};

export function getWorkerStrings(langCode: string): WorkerUiStrings {
  const clean = (langCode || 'en').toLowerCase();
  const specific = TRANSLATIONS[clean];
  if (!specific) return EN_STRINGS;
  return { ...EN_STRINGS, ...specific };
}

export function getLanguageMeta(langCode: string): WorkerLanguageMeta {
  return WORKER_LANGUAGES.find((l) => l.code === langCode) ?? WORKER_LANGUAGES[0];
}

export function isSpeechSupported(): boolean {
  return typeof window !== 'undefined' && 'speechSynthesis' in window;
}

export function stopWorkerSpeech(): void {
  if (!isSpeechSupported()) return;
  try {
    window.speechSynthesis.cancel();
  } catch {
    // ignore speech cancel errors
  }
}

export function speakWorkerText(
  text: string,
  langCode: string,
  onDone?: () => void
): boolean {
  if (!isSpeechSupported() || !text.trim()) {
    onDone?.();
    return false;
  }
  try {
    window.speechSynthesis.cancel();
    const meta = getLanguageMeta(langCode);
    const utterance = new SpeechSynthesisUtterance(text);
    const voices = window.speechSynthesis.getVoices();
    const matched =
      voices.find((v) => v.lang.toLowerCase() === meta.bcp47.toLowerCase()) ||
      voices.find((v) => v.lang.toLowerCase().startsWith(meta.code.toLowerCase())) ||
      voices.find((v) => v.lang.toLowerCase().startsWith('en'));

    if (matched) {
      utterance.voice = matched;
      utterance.lang = matched.lang;
    } else {
      utterance.lang = meta.bcp47;
    }
    utterance.rate = 0.95;
    utterance.onend = () => onDone?.();
    utterance.onerror = () => onDone?.();
    window.speechSynthesis.speak(utterance);
    return true;
  } catch {
    onDone?.();
    return false;
  }
}

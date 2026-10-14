export type LeadLanguage = "pt" | "en" | "es";

export type LanguageDetection = {
  language: LeadLanguage | null;
  confidence: "explicit" | "strong" | "weak" | "none";
  scores: Record<LeadLanguage, number>;
};

export type ResponseLanguageValidation = {
  allowed: boolean;
  expected_language: LeadLanguage;
  detected_languages: Array<LeadLanguage | null>;
  reason: "matched" | "neutral_text" | "response_language_mismatch";
};

const vocab: Record<LeadLanguage, Set<string>> = {
  pt: new Set([
    "oi", "ola", "voce", "voces", "gostaria", "quero", "queria", "preciso",
    "tratamento", "tratamentos", "pele", "corpo", "preco", "valor", "quanto",
    "onde", "quando", "agendar", "marcar", "avaliacao", "amanha", "obrigado",
    "obrigada", "horario", "horarios", "disponibilidade", "tenho", "posso",
    "bom", "boa", "tarde", "noite", "dia", "sim", "nao", "tambem",
  ]),
  en: new Set([
    "hello", "hi", "hey", "you", "your", "would", "like", "want", "need",
    "treatment", "treatments", "skin", "body", "price", "cost", "much", "where",
    "when", "appointment", "book", "schedule", "tomorrow", "thanks", "thank",
    "available", "availability", "time", "times", "have", "can", "please",
    "morning", "afternoon", "evening", "yes", "also", "what", "which", "how",
  ]),
  es: new Set([
    "hola", "usted", "ustedes", "quisiera", "quiero", "necesito", "tratamiento",
    "tratamientos", "piel", "cuerpo", "precio", "cuanto", "donde", "cuando",
    "cita", "agendar", "reservar", "manana", "gracias", "horario", "horarios",
    "disponibilidad", "tengo", "puedo", "buenos", "buenas", "tardes", "noches",
    "si", "tambien", "que", "cual", "como", "favor",
  ]),
};

function normalizedWords(text: string) {
  return text
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export function explicitLanguageRequest(text: string): LeadLanguage | null {
  const normalized = ` ${normalizedWords(text).join(" ")} `;
  if (/\b((in|speak) english|(em|en) (ingles|english)|english please)\b/.test(normalized)) {
    return "en";
  }
  if (/\b((en|em) (espanol|espanhol)|(in|speak) spanish|habla(?:r|s)? espanol|espanol por favor)\b/.test(normalized)) {
    return "es";
  }
  if (/\b((em|en) portugues|(in|speak) portuguese|fala(?:r)? portugues|portugues por favor)\b/.test(normalized)) {
    return "pt";
  }
  return null;
}

export function detectLanguage(text: string): LanguageDetection {
  const explicit = explicitLanguageRequest(text);
  const scores: Record<LeadLanguage, number> = { pt: 0, en: 0, es: 0 };
  if (explicit) {
    scores[explicit] = 100;
    return { language: explicit, confidence: "explicit", scores };
  }

  const lower = text.toLowerCase();
  const normalized = normalizedWords(text);
  const uniqueSingleWord: Partial<Record<string, LeadLanguage>> = {
    oi: "pt",
    ola: "pt",
    hello: "en",
    hi: "en",
    hola: "es",
  };
  if (normalized.length === 1 && uniqueSingleWord[normalized[0]]) {
    const language = uniqueSingleWord[normalized[0]]!;
    scores[language] = 4;
    return { language, confidence: "strong", scores };
  }
  if (/[çãõ]/.test(lower)) scores.pt += 3;
  if (/[¿¡ñ]/.test(lower)) scores.es += 3;
  for (const word of normalized) {
    for (const language of ["pt", "en", "es"] as const) {
      if (vocab[language].has(word)) scores[language] += 1;
    }
  }

  const ranked: LeadLanguage[] = ["pt", "en", "es"];
  ranked.sort(
    (left, right) => scores[right] - scores[left],
  );
  const first = ranked[0];
  const advantage = scores[first] - scores[ranked[1]];
  if (scores[first] >= 3 && advantage >= 2) {
    return { language: first, confidence: "strong", scores };
  }
  if (scores[first] >= 2 && advantage >= 1) {
    return { language: first, confidence: "weak", scores };
  }
  return { language: null, confidence: "none", scores };
}

export function resolveLeadLanguage(
  latestLeadText: string,
  previousLanguage?: LeadLanguage | null,
): LeadLanguage | null {
  const detection = detectLanguage(latestLeadText);
  if (!previousLanguage) return detection.language;
  if (!detection.language || detection.confidence === "none") return previousLanguage;
  if (detection.language === previousLanguage) return previousLanguage;
  return detection.confidence === "explicit" || detection.confidence === "strong"
    ? detection.language
    : previousLanguage;
}

export function validateResponseLanguages(
  expectedLanguage: LeadLanguage,
  texts: string[],
): ResponseLanguageValidation {
  const detected = texts.map((text) => detectLanguage(text).language);
  const mismatched = detected.some(
    (language) => language !== null && language !== expectedLanguage,
  );
  if (mismatched) {
    return {
      allowed: false,
      expected_language: expectedLanguage,
      detected_languages: detected,
      reason: "response_language_mismatch",
    };
  }
  return {
    allowed: true,
    expected_language: expectedLanguage,
    detected_languages: detected,
    reason: detected.every((language) => language === null) ? "neutral_text" : "matched",
  };
}

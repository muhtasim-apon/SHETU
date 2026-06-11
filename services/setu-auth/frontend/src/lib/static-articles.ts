// Offline/error fallback articles for the patient (Shetu Saathi) health blog.
// Each entry links to a real, working WHO/CDC/NHS/MedlinePlus/ACOG article via
// `source_url` so the "Read full source" link on the article page always works.

export interface StaticArticle {
  id?: string;
  title: string;
  slug: string;
  category: string;
  summary?: string;
  content?: string;
  author_name?: string;
  author_role?: string;
  read_time_mins?: number;
  published_at?: string;
  source_url: string;
  is_bookmarked?: boolean;
  tags?: string[];
}

export const STATIC_ARTICLES: StaticArticle[] = [
  { slug: "diabetes-management-bangladesh", title: "Managing Diabetes in Bangladesh: A Complete Guide", category: "chronic_disease", summary: "Evidence-based strategies for controlling blood sugar with affordable local foods, medication adherence, and lifestyle changes.", author_name: "Dr. Rasheda Khanam", read_time_mins: 8, source_url: "https://www.who.int/news-room/fact-sheets/detail/diabetes" },
  { slug: "hypertension-salt-reduction", title: "High Blood Pressure: Why Salt Matters and How to Cut It", category: "chronic_disease", summary: "How sodium affects blood pressure and practical tips using Bangladeshi cuisine to stay under 2,000 mg/day.", author_name: "Dr. Farhan Islam", read_time_mins: 6, source_url: "https://www.who.int/news-room/fact-sheets/detail/hypertension" },
  { slug: "anaemia-iron-rich-foods", title: "Fighting Anaemia with Iron-Rich Bangladeshi Foods", category: "nutrition", summary: "Spinach, lentils, hilsa fish, and molasses — how to boost haemoglobin naturally on a low budget.", author_name: "Dr. Sumaiya Ahmed", read_time_mins: 5, source_url: "https://www.who.int/news-room/fact-sheets/detail/anaemia" },
  { slug: "mental-health-stigma", title: "Breaking the Stigma: Mental Health in Bangladesh", category: "mental_health", summary: "Understanding depression and anxiety, how to seek help, and community resources available across divisions.", author_name: "Dr. Nusrat Jahan", read_time_mins: 7, source_url: "https://www.who.int/news-room/fact-sheets/detail/mental-disorders" },
  { slug: "exercise-for-chronic-disease", title: "Safe Exercise with Chronic Disease: Start Where You Are", category: "exercise_wellness", summary: "Walking, yoga, and swimming routines adapted for people with diabetes, hypertension, or heart disease.", author_name: "Physiotherapist Rina Begum", read_time_mins: 6, source_url: "https://www.who.int/news-room/fact-sheets/detail/physical-activity" },
  { slug: "recognising-heart-attack-signs", title: "Recognising a Heart Attack: Don't Ignore These Signs", category: "emergency_signs", summary: "Chest pressure, left arm pain, jaw pain — know when to call 999. Includes what to do while waiting for help.", author_name: "Dr. Kamal Hossain", read_time_mins: 4, source_url: "https://www.cdc.gov/heart-disease/about/index.html" },
  { slug: "kidney-disease-prevention", title: "Protecting Your Kidneys: Prevention and Early Signs", category: "chronic_disease", summary: "How to preserve kidney function through hydration, blood sugar control, and reducing NSAID use.", author_name: "Dr. Arif Chowdhury", read_time_mins: 7, source_url: "https://www.cdc.gov/kidney-disease/index.html" },
  { slug: "thyroid-disorders-women", title: "Thyroid Disorders in Women: Symptoms You Should Know", category: "general_health", summary: "Hypothyroidism and hyperthyroidism explained — fatigue, weight changes, hair loss, and when to get tested.", author_name: "Dr. Shahida Parvin", read_time_mins: 5, source_url: "https://medlineplus.gov/thyroiddiseases.html" },
  { slug: "healthy-eating-ramadan", title: "Staying Healthy During Ramadan with Chronic Conditions", category: "nutrition", summary: "How to safely fast with diabetes or hypertension, what to eat at sehri and iftar, and when to break the fast.", author_name: "Nutritionist Fatema Khatun", read_time_mins: 6, source_url: "https://www.who.int/news-room/fact-sheets/detail/healthy-diet" },
  { slug: "stroke-warning-signs", title: "FAST: Recognising Stroke Symptoms Before It's Too Late", category: "emergency_signs", summary: "Face drooping, Arm weakness, Speech difficulty, Time to call 999. Every minute of delay costs brain cells.", author_name: "Dr. Mamun Rashid", read_time_mins: 3, source_url: "https://www.cdc.gov/stroke/signs-symptoms/index.html" },
  { slug: "sleep-disorders-bangladesh", title: "Why Bangladesh's Adults Are Sleep-Deprived and How to Fix It", category: "lifestyle", summary: "Sleep hygiene tips that work in a South Asian household, how poor sleep worsens diabetes and heart disease.", author_name: "Dr. Rubina Akhter", read_time_mins: 5, source_url: "https://www.cdc.gov/sleep/about/index.html" },
  { slug: "metformin-guide", title: "Metformin: What Every Bangladeshi Diabetic Patient Must Know", category: "medicine_guide", summary: "How to take metformin correctly, manage side effects, and what foods to avoid with this common medication.", author_name: "Pharmacist Mohiuddin Sarkar", read_time_mins: 5, source_url: "https://www.nhs.uk/medicines/metformin/" },
  { slug: "general-health-checkup", title: "Essential Health Tests Every Adult Should Get Annually", category: "general_health", summary: "Blood glucose, HbA1c, lipid profile, creatinine, TSH — why you need these and where to get them affordably.", author_name: "Dr. Shirin Sultana", read_time_mins: 4, source_url: "https://www.nhs.uk/conditions/nhs-health-check/" },
  { slug: "cholesterol-diet", title: "Lowering Cholesterol Through Diet: A Bangladeshi Perspective", category: "nutrition", summary: "Reducing saturated fats from mustard oil and ghee, increasing omega-3 from hilsa and sardines.", author_name: "Nutritionist Anika Islam", read_time_mins: 6, source_url: "https://www.nhs.uk/conditions/high-cholesterol/" },
  { slug: "mental-wellness-daily-habits", title: "10 Daily Habits for Better Mental Wellness", category: "mental_health", summary: "Practical, free mental wellness strategies: gratitude journaling, social connection, nature time, and mindful prayer.", author_name: "Counselor Dilara Begum", read_time_mins: 5, source_url: "https://www.nhs.uk/mental-health/self-help/guides-tools-and-activities/five-steps-to-mental-wellbeing/" },
];

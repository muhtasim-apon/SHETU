// Offline/error fallback articles for the mother (pregnancy) health blog.
// Each entry links to a real, working WHO/NHS/ACOG article via `source_url`
// so the "Read original source" link on the article page always works.

export interface StaticPregnancyArticle {
  id: string;
  slug: string;
  title: string;
  category: string;
  summary?: string;
  content?: string;
  author_name?: string;
  author_role?: string;
  read_time_mins?: number;
  published_at?: string;
  source_url: string;
  is_bookmarked?: boolean;
}

export const STATIC_PREGNANCY_ARTICLES: StaticPregnancyArticle[] = [
  { id: 's1', slug: 'antenatal-care-visits', title: 'Why 8 ANC Visits Can Save Your Life and Your Baby\'s', category: 'pregnancy_health', summary: 'WHO recommends 8 antenatal visits. Each visit catches problems early — preeclampsia, anaemia, gestational diabetes — when they\'re still treatable.', author_name: 'Dr. Sultana Begum', read_time_mins: 6, source_url: 'https://www.who.int/news-room/fact-sheets/detail/antenatal-care' },
  { id: 's2', slug: 'preeclampsia-warning-signs', title: 'Preeclampsia: The Silent Danger Every Pregnant Woman Must Know', category: 'maternal_diseases', summary: 'Severe headache, swollen face and hands, vision changes, and upper-right abdominal pain — these are emergency signs. Go to hospital immediately.', author_name: 'Dr. Nasreen Akhter', read_time_mins: 5, source_url: 'https://www.nhs.uk/conditions/pre-eclampsia/' },
  { id: 's3', slug: 'iron-folic-acid-pregnancy', title: 'Iron and Folic Acid Supplements During Pregnancy: A Complete Guide', category: 'nutrition', summary: 'Why every pregnant woman in Bangladesh needs iron and folic acid, when to take them, and what to avoid for better absorption.', author_name: 'Nutritionist Parvin Islam', read_time_mins: 5, source_url: 'https://www.who.int/news-room/fact-sheets/detail/micronutrients' },
  { id: 's4', slug: 'pregnancy-nutrition-bangladeshi', title: 'Eating Well During Pregnancy on a Bangladeshi Budget', category: 'nutrition', summary: 'Dal, eggs, green leafy vegetables, hilsa fish — how affordable local foods meet your nutritional needs during each trimester.', author_name: 'Dr. Runa Laila', read_time_mins: 7, source_url: 'https://www.nhs.uk/pregnancy/keeping-well/have-a-healthy-diet/' },
  { id: 's5', slug: 'fetal-movement-counting', title: 'Kick Counting: How to Know Your Baby is Doing Well', category: 'pregnancy_health', summary: 'From 28 weeks, count fetal movements every day. Less than 10 movements in 2 hours? Call your doctor immediately.', author_name: 'Midwife Rashida Khatun', read_time_mins: 4, source_url: 'https://www.nhs.uk/pregnancy/keeping-well/your-babys-movements/' },
  { id: 's6', slug: 'gestational-diabetes', title: 'Gestational Diabetes: Managing Blood Sugar Safely While Pregnant', category: 'maternal_diseases', summary: 'What GDM means, how it\'s diagnosed at 24–28 weeks, and how to keep blood sugar controlled through diet and sometimes medication.', author_name: 'Dr. Fatema Johora', read_time_mins: 6, source_url: 'https://www.nhs.uk/conditions/gestational-diabetes/' },
  { id: 's7', slug: 'birth-preparedness', title: 'Birth Preparedness: Planning for a Safe Delivery', category: 'pregnancy_health', summary: 'Choosing a facility, saving money for delivery, identifying a blood donor, planning transport — the 5 steps every family must take by 36 weeks.', author_name: 'UNFPA Bangladesh', read_time_mins: 5, source_url: 'https://www.who.int/health-topics/pregnancy' },
  { id: 's8', slug: 'postpartum-depression', title: 'Postpartum Depression is Real — and Treatable', category: 'postpartum', summary: 'Feeling sad, hopeless, or unable to bond with your baby after birth? You are not alone. Help is available through Shetu Saathi.', author_name: 'Dr. Nusrat Jahan', read_time_mins: 5, source_url: 'https://www.nhs.uk/mental-health/conditions/post-natal-depression/overview/' },
  { id: 's9', slug: 'breastfeeding-benefits', title: 'Exclusive Breastfeeding for 6 Months: Benefits and How-To', category: 'newborn_care', summary: 'Breast milk is the perfect food for your baby. How to latch correctly, maintain supply, and manage common challenges.', author_name: 'Lactation Consultant Rina Begum', read_time_mins: 6, source_url: 'https://www.who.int/news-room/fact-sheets/detail/breastfeeding' },
  { id: 's10', slug: 'pregnancy-safe-exercise', title: 'Safe Exercises During Each Trimester of Pregnancy', category: 'exercise_wellness', summary: 'Walking, swimming, and prenatal yoga are safe and beneficial. What to avoid and how to listen to your body.', author_name: 'Physiotherapist Dilara Hossain', read_time_mins: 5, source_url: 'https://www.nhs.uk/pregnancy/keeping-well/exercise/' },
  { id: 's11', slug: 'danger-signs-pregnancy', title: '7 Danger Signs in Pregnancy That Need Emergency Care NOW', category: 'emergency_signs', summary: 'Heavy bleeding, severe headache, blurred vision, fits, no fetal movement, high fever, and swollen face — any one means go to hospital NOW and call 999.', author_name: 'Dr. Khaleda Rashid', read_time_mins: 3, source_url: 'https://www.who.int/news-room/fact-sheets/detail/maternal-mortality' },
  { id: 's12', slug: 'newborn-care-first-week', title: 'Your Newborn\'s First Week: What\'s Normal and What\'s Not', category: 'newborn_care', summary: 'Skin colour, breathing patterns, weight loss, jaundice, umbilical cord care — a complete guide for new mothers.', author_name: 'Paediatrician Dr. Aminul Islam', read_time_mins: 7, source_url: 'https://www.who.int/news-room/fact-sheets/detail/newborn-health' },
  { id: 's13', slug: 'pregnancy-mental-health', title: 'Anxiety During Pregnancy: You Can Feel Better', category: 'mental_health', summary: 'It\'s normal to worry, but severe anxiety needs support. Breathing techniques, social support, and when to seek professional help.', author_name: 'Counselor Shahana Begum', read_time_mins: 5, source_url: 'https://www.nhs.uk/pregnancy/keeping-well/mental-health/' },
  { id: 's14', slug: 'anaemia-in-pregnancy', title: 'Anaemia in Pregnancy: Causes, Risks, and Treatment', category: 'maternal_diseases', summary: 'Low haemoglobin increases risk of preterm birth and maternal death. How to diagnose, treat, and prevent anaemia during pregnancy.', author_name: 'Dr. Rokeya Sultana', read_time_mins: 6, source_url: 'https://www.who.int/news-room/fact-sheets/detail/anaemia' },
  { id: 's15', slug: 'postpartum-recovery', title: 'Recovering After Birth: What Your Body Needs in the First 40 Days', category: 'postpartum', summary: 'Rest, nutrition, wound care, and warning signs — how to heal safely after both vaginal and caesarean delivery.', author_name: 'Midwife Farida Begum', read_time_mins: 6, source_url: 'https://www.acog.org/womens-health/faqs/postpartum-care' },
];

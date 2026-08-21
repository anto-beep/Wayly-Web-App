// Ported from web frontend/src/data/cscQuestions.js — CSC-1 v1, 16 questions
// across 7 domains, each with caregiver + participant stems and an ordinal
// scale. Used by the mobile Classification Self-Check tool.

export type Opt = { value: string; label: string };

export const DIFFICULTY_SCALE: Opt[] = [
  { value: "no_difficulty", label: "No difficulty" },
  { value: "slight", label: "Slight" },
  { value: "moderate", label: "Moderate" },
  { value: "significant", label: "Significant" },
  { value: "cannot_alone", label: "Cannot do alone" },
];
export const FREQUENCY_SCALE: Opt[] = [
  { value: "never", label: "Never" },
  { value: "rarely", label: "Rarely" },
  { value: "sometimes", label: "Sometimes" },
  { value: "often", label: "Often" },
  { value: "every_day", label: "Every day" },
];
export const COUNT_SCALE: Opt[] = [
  { value: "zero", label: "0" },
  { value: "one", label: "1" },
  { value: "two_to_three", label: "2 to 3" },
  { value: "more_than_three", label: "More than 3" },
];
export const AMOUNT_SCALE: Opt[] = [
  { value: "none", label: "None" },
  { value: "a_little", label: "A little" },
  { value: "some", label: "Some" },
  { value: "a_lot", label: "A lot" },
  { value: "full_time", label: "Full-time" },
];
const NOT_SURE: Opt = { value: "not_sure", label: "Not sure" };
const withNotSure = (scale: Opt[]) => [...scale, NOT_SURE];

export type CscQuestion = { id: string; domain: string; stem: { caregiver: string; participant: string }; scale: Opt[] };

export const CSC_QUESTIONS: CscQuestion[] = [
  { id: "Q1_self_care_shower", domain: "Self-care", stem: { caregiver: "How easily does your parent shower or bathe themselves?", participant: "How easily do you shower or bathe yourself?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q2_self_care_dress", domain: "Self-care", stem: { caregiver: "How easily do they dress and groom themselves?", participant: "How easily do you dress and groom yourself?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q3_self_care_mobility", domain: "Self-care", stem: { caregiver: "How easily do they get out of bed and move around the house?", participant: "How easily do you get out of bed and move around your home?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q4_self_care_continence", domain: "Self-care", stem: { caregiver: "How easily do they manage the toilet, bladder and bowels?", participant: "How easily do you manage the toilet, bladder and bowels?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q5_iadl_meals", domain: "IADLs", stem: { caregiver: "How easily do they prepare a simple meal?", participant: "How easily do you prepare a simple meal?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q6_iadl_cleaning_laundry", domain: "IADLs", stem: { caregiver: "How easily do they manage household cleaning and laundry?", participant: "How easily do you manage household cleaning and laundry?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q7_iadl_medication", domain: "IADLs", stem: { caregiver: "How easily do they manage their own medication?", participant: "How easily do you manage your medications?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q8_iadl_shopping", domain: "IADLs", stem: { caregiver: "How easily do they manage shopping and errands?", participant: "How easily do you manage shopping and errands?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q9_iadl_transport", domain: "IADLs", stem: { caregiver: "How easily do they manage transport and appointments?", participant: "How easily do you manage transport and appointments?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q10_cognition", domain: "Cognition", stem: { caregiver: "How is their memory, ability to follow conversations and make everyday decisions?", participant: "How is your memory, ability to follow conversations and make everyday decisions?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q11_mood", domain: "Mood", stem: { caregiver: "How is their mood and emotional wellbeing?", participant: "How is your mood and emotional wellbeing?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q12_behaviour", domain: "Behaviour", stem: { caregiver: "How often do they show agitation, confusion at night or resistance to help?", participant: "How often do you feel confused at night, agitated or find yourself resisting help you know you need?" }, scale: withNotSure(FREQUENCY_SCALE) },
  { id: "Q13_falls_6mo", domain: "Safety", stem: { caregiver: "How many falls have they had in the last 6 months?", participant: "How many falls have you had in the last 6 months?" }, scale: withNotSure(COUNT_SCALE) },
  { id: "Q14_hospital_12mo", domain: "Safety", stem: { caregiver: "How many hospital or emergency-department visits in the last 12 months?", participant: "How many hospital or emergency-department visits in the last 12 months?" }, scale: withNotSure(COUNT_SCALE) },
  { id: "Q15_home_environment", domain: "Home environment", stem: { caregiver: "How safe and manageable is their home for them (stairs, bathroom, isolation)?", participant: "How safe and manageable is your home for you (stairs, bathroom, isolation)?" }, scale: withNotSure(DIFFICULTY_SCALE) },
  { id: "Q16_informal_support", domain: "Informal support", stem: { caregiver: "How much informal support (family, neighbours) do they currently receive?", participant: "How much informal support (family, neighbours) do you currently receive?" }, scale: withNotSure(AMOUNT_SCALE) },
];

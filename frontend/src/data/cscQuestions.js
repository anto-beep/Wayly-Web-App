// CSC-1 v1 question set (§4.4 of CSC-1-v1.md).
// 16 questions across 7 domains. Every question has caregiver + participant
// stems, an ordinal scale, and per-level anchor examples.

export const DIFFICULTY_SCALE = [
    { value: "no_difficulty", label: "No difficulty" },
    { value: "slight", label: "Slight" },
    { value: "moderate", label: "Moderate" },
    { value: "significant", label: "Significant" },
    { value: "cannot_alone", label: "Cannot do alone" },
];

export const FREQUENCY_SCALE = [
    { value: "never", label: "Never" },
    { value: "rarely", label: "Rarely" },
    { value: "sometimes", label: "Sometimes" },
    { value: "often", label: "Often" },
    { value: "every_day", label: "Every day" },
];

export const COUNT_SCALE = [
    { value: "zero", label: "0" },
    { value: "one", label: "1" },
    { value: "two_to_three", label: "2 to 3" },
    { value: "more_than_three", label: "More than 3" },
];

export const AMOUNT_SCALE = [
    { value: "none", label: "None" },
    { value: "a_little", label: "A little" },
    { value: "some", label: "Some" },
    { value: "a_lot", label: "A lot" },
    { value: "full_time", label: "Full-time" },
];

const NOT_SURE = { value: "not_sure", label: "Not sure" };

// Helper: appends "Not sure" as the sixth option.
const withNotSure = (scale) => [...scale, NOT_SURE];

// Question shape: { id, domain, stem: { caregiver, participant }, scale, anchors }
// - anchors[option.value] = plain-English example shown on hover/tap
export const CSC_QUESTIONS = [
    // ---- Self-care (ADLs) ----
    {
        id: "Q1_self_care_shower",
        domain: "Self-care",
        stem: {
            caregiver: "How easily does your parent shower or bathe themselves?",
            participant: "How easily do you shower or bathe yourself?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Showers independently, no supervision needed.",
            slight: "Uses grab rails or a shower chair, but does it alone.",
            moderate: "Needs someone in the house, sometimes reminders.",
            significant: "Needs hands-on help for parts of it, like washing back or hair.",
            cannot_alone: "Needs full assistance every time.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    {
        id: "Q2_self_care_dress",
        domain: "Self-care",
        stem: {
            caregiver: "How easily do they dress and groom themselves?",
            participant: "How easily do you dress and groom yourself?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Chooses and puts on clothes independently.",
            slight: "Slow, uses adaptive aids (button hook, elastic laces), does it alone.",
            moderate: "Needs prompting or help laying out clothes.",
            significant: "Needs help with buttons, zips, shoes or bras every time.",
            cannot_alone: "Needs full assistance to dress.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    {
        id: "Q3_self_care_mobility",
        domain: "Self-care",
        stem: {
            caregiver: "How easily do they get out of bed and move around the house?",
            participant: "How easily do you get out of bed and move around your home?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Walks freely, no aid.",
            slight: "Uses a cane or frame, moves independently.",
            moderate: "Uses a walker, occasionally needs a steadying arm.",
            significant: "Needs help to stand or transfer, wobbly on feet.",
            cannot_alone: "Needs hoist, wheelchair transfer or two-person assistance.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    {
        id: "Q4_self_care_continence",
        domain: "Self-care",
        stem: {
            caregiver: "How easily do they manage the toilet, bladder and bowels?",
            participant: "How easily do you manage the toilet, bladder and bowels?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Continent day and night, manages independently.",
            slight: "Occasional accidents, uses pads as a precaution.",
            moderate: "Regular accidents, uses pads daily, needs reminders.",
            significant: "Incontinent day or night, needs help changing.",
            cannot_alone: "Fully incontinent, needs full continence care.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    // ---- IADLs ----
    {
        id: "Q5_iadl_meals",
        domain: "IADLs",
        stem: {
            caregiver: "How easily do they prepare a simple meal?",
            participant: "How easily do you prepare a simple meal?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Plans and cooks meals independently.",
            slight: "Cooks simple meals, avoids anything complex.",
            moderate: "Reheats or assembles food, doesn't cook from scratch.",
            significant: "Needs meals prepared for them most days.",
            cannot_alone: "Needs meals fully prepared and often prompted to eat.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    {
        id: "Q6_iadl_cleaning_laundry",
        domain: "IADLs",
        stem: {
            caregiver: "How easily do they manage household cleaning and laundry?",
            participant: "How easily do you manage household cleaning and laundry?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Keeps home clean and laundry done without help.",
            slight: "Does most of it, gets help with heavy tasks.",
            moderate: "Needs regular help with cleaning or laundry.",
            significant: "Does very little, home isn't kept clean without help.",
            cannot_alone: "Depends entirely on someone else for cleaning and laundry.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    {
        id: "Q7_iadl_medication",
        domain: "IADLs",
        stem: {
            caregiver: "How easily do they manage their own medication?",
            participant: "How easily do you manage your medications?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Takes the right meds at the right time, no help needed.",
            slight: "Uses a Webster pack or reminder, manages otherwise.",
            moderate: "Needs prompting or someone to check regularly.",
            significant: "Someone else must set out and prompt every dose.",
            cannot_alone: "Someone else must administer every dose.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    {
        id: "Q8_iadl_shopping",
        domain: "IADLs",
        stem: {
            caregiver: "How easily do they manage shopping and errands?",
            participant: "How easily do you manage shopping and errands?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Shops independently, online or in person.",
            slight: "Does small shops, needs help with heavy loads.",
            moderate: "Needs someone to drive them or do most of it.",
            significant: "Rarely shops, depends on others for most items.",
            cannot_alone: "Doesn't shop, someone else does it all.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    {
        id: "Q9_iadl_transport",
        domain: "IADLs",
        stem: {
            caregiver: "How easily do they manage transport and appointments?",
            participant: "How easily do you manage transport and appointments?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Drives, takes public transport or books their own rides.",
            slight: "Uses taxis or family lifts by choice, could do more.",
            moderate: "Depends on family for most trips, can't use public transport.",
            significant: "Needs door-to-door assisted transport, someone must attend.",
            cannot_alone: "Housebound, all appointments arranged and attended by others.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    // ---- Cognition / Behaviour ----
    {
        id: "Q10_cognition",
        domain: "Cognition",
        stem: {
            caregiver: "How is their memory, ability to follow conversations and make everyday decisions?",
            participant: "How is your memory, ability to follow conversations and make everyday decisions?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Sharp, follows complex conversations, makes own decisions.",
            slight: "Occasional forgetfulness, no impact on daily life.",
            moderate: "Regular forgetfulness, needs prompts for appointments and tasks.",
            significant: "Confused often, struggles with new information or decisions.",
            cannot_alone: "Can't reliably make everyday decisions without support.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    {
        id: "Q11_mood",
        domain: "Mood",
        stem: {
            caregiver: "How is their mood and emotional wellbeing?",
            participant: "How is your mood and emotional wellbeing?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Generally positive, engaged, enjoying life.",
            slight: "Occasional low mood, gets through it.",
            moderate: "Regularly flat, anxious or withdrawn.",
            significant: "Persistently low, anxious or distressed, affects daily life.",
            cannot_alone: "Severe depression, anxiety or distress needing clinical support.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    {
        id: "Q12_behaviour",
        domain: "Behaviour",
        stem: {
            caregiver: "How often do they show agitation, confusion at night or resistance to help?",
            participant: "How often do you feel confused at night, agitated or find yourself resisting help you know you need?",
        },
        scale: withNotSure(FREQUENCY_SCALE),
        anchors: {
            never: "Doesn't happen.",
            rarely: "A few times a year at most.",
            sometimes: "A few times a month.",
            often: "Weekly or more.",
            every_day: "Daily or most days.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    // ---- Safety ----
    {
        id: "Q13_falls_6mo",
        domain: "Safety",
        stem: {
            caregiver: "How many falls have they had in the last 6 months?",
            participant: "How many falls have you had in the last 6 months?",
        },
        scale: withNotSure(COUNT_SCALE),
        anchors: {},
    },
    {
        id: "Q14_hospital_12mo",
        domain: "Safety",
        stem: {
            caregiver: "How many hospital or emergency-department visits in the last 12 months?",
            participant: "How many hospital or emergency-department visits in the last 12 months?",
        },
        scale: withNotSure(COUNT_SCALE),
        anchors: {},
    },
    // ---- Home environment ----
    {
        id: "Q15_home_environment",
        domain: "Home environment",
        stem: {
            caregiver: "How safe and manageable is their home for them (stairs, bathroom, isolation)?",
            participant: "How safe and manageable is your home for you (stairs, bathroom, isolation)?",
        },
        scale: withNotSure(DIFFICULTY_SCALE),
        anchors: {
            no_difficulty: "Single level, safe bathroom, close to family or services.",
            slight: "Manageable with minor tweaks (rails, mats).",
            moderate: "Some real hazards (stairs, unsafe bathroom, isolated location).",
            significant: "Home isn't well suited, needs modifications to stay safely.",
            cannot_alone: "Home is unsafe, staying without major changes isn't viable.",
            not_sure: "I don't know or haven't seen.",
        },
    },
    // ---- Informal support (inverse) ----
    {
        id: "Q16_informal_support",
        domain: "Informal support",
        stem: {
            caregiver: "How much informal support (family, neighbours) do they currently receive?",
            participant: "How much informal support (family, neighbours) do you currently receive?",
        },
        scale: withNotSure(AMOUNT_SCALE),
        anchors: {
            none: "No family or neighbour support.",
            a_little: "Occasional check-in, less than weekly.",
            some: "Weekly help with one or two things.",
            a_lot: "Several visits a week, help with multiple tasks.",
            full_time: "A carer lives in or visits daily to provide substantial care.",
            not_sure: "I don't know.",
        },
    },
];

export const HIGH_WEIGHT_QUESTIONS = new Set([
    "Q1_self_care_shower",
    "Q2_self_care_dress",
    "Q3_self_care_mobility",
    "Q4_self_care_continence",
    "Q7_iadl_medication",
    "Q10_cognition",
    "Q12_behaviour",
]);

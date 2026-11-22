/**
 * Curated Pexels photography for Wayly marketing surfaces.
 *
 * All URLs point to Pexels (Creative Commons, free-to-use). Pexels
 * permits direct hotlinking without an API key. Every URL below has been
 * HEAD-verified 200 at time of adding, if one starts returning 404 in
 * future, replace the ID here and the whole site updates.
 *
 * Naming convention: lowercased camelCase describing the human moment,
 * not the aesthetic (e.g. `elderReadingSolo`, not `warmBeigeShot1`).
 */

// A wider palette than v1: no single image is now used more than once
// across the site, and every marketing surface has its own distinct hero.
export const PHOTOS = {
    // Adult daughter and older mother at a kitchen table with a laptop ,
    // the "helping mum with paperwork" moment. Used on About Section I.
    kitchenMoment: {
        src: "https://images.pexels.com/photos/7551752/pexels-photo-7551752.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Adult daughter and her older mother reading paperwork together at a bright kitchen table",
        credit: "Photo: Kampus Production on Pexels",
    },
    // Adult daughter on the phone at her kitchen. Used on Landing "how".
    daughterOnPhone: {
        src: "https://images.pexels.com/photos/4098365/pexels-photo-4098365.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Adult daughter on the phone at her kitchen, tea beside her",
        credit: "Photo: Andrea Piacquadio on Pexels",
    },
    // Two generations at a table together looking at paperwork. Features hero.
    familyTable: {
        src: "https://images.pexels.com/photos/6647037/pexels-photo-6647037.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Adult child and older parent looking at paperwork together on a wooden kitchen table",
        credit: "Photo: RDNE Stock project on Pexels",
    },
    // Hands with tea and a page, subtle, human, no faces. Pricing hero.
    handsAndPaper: {
        src: "https://images.pexels.com/photos/8942991/pexels-photo-8942991.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Hands of an older person holding a printed document beside a cup of tea",
        credit: "Photo: cottonbro studio on Pexels",
    },
    // Warm older Australian portrait, About Section VIII "If it's your name".
    peacefulMorning: {
        src: "https://images.pexels.com/photos/7551634/pexels-photo-7551634.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Older Australian smiling in soft morning light",
        credit: "Photo: Kampus Production on Pexels",
    },
    // Adult daughter helping older mother with a laptop. Contact sidebar.
    helpingHand: {
        src: "https://images.pexels.com/photos/7551755/pexels-photo-7551755.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Adult daughter sitting with her mother, both looking at a laptop screen",
        credit: "Photo: Kampus Production on Pexels",
    },
    // Older person reading alone at home, the participant hero moment.
    elderReadingSolo: {
        src: "https://images.pexels.com/photos/3768593/pexels-photo-3768593.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Older woman reading a letter at home in natural window light",
        credit: "Photo: Andrea Piacquadio on Pexels",
    },
    // Grandparent + grandchild, the multi-generational care moment.
    familyThreeGenerations: {
        src: "https://images.pexels.com/photos/3768124/pexels-photo-3768124.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Older woman with her adult daughter and grandchild at home",
        credit: "Photo: Andrea Piacquadio on Pexels",
    },
    // Peaceful outdoors moment, walking, contemplation. About Section VI.
    outdoorMoment: {
        src: "https://images.pexels.com/photos/6621337/pexels-photo-6621337.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Older Australian outdoors on a warm afternoon",
        credit: "Photo: Kampus Production on Pexels",
    },
    // Older man with adult son, the caregiver-participant conversation.
    elderWithSon: {
        src: "https://images.pexels.com/photos/7220283/pexels-photo-7220283.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Adult son sitting with his older father, having a conversation at home",
        credit: "Photo: Kampus Production on Pexels",
    },
    // Older woman on the phone, the participant-agency shot.
    elderOnPhone: {
        src: "https://images.pexels.com/photos/6642504/pexels-photo-6642504.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Older Australian woman speaking on her mobile phone",
        credit: "Photo: Andrea Piacquadio on Pexels",
    },
    // Warm portrait, laughing older Australian. Reserve for Testimonial 2.
    warmPortrait: {
        src: "https://images.pexels.com/photos/3768914/pexels-photo-3768914.jpeg?auto=compress&cs=tinysrgb&w=1600",
        alt: "Older Australian laughing warmly, close portrait",
        credit: "Photo: Andrea Piacquadio on Pexels",
    },
};

import React, { useState } from "react";

/**
 * `<Photo />` is a small hardened <img> that gracefully degrades when
 * an external Pexels URL fails to load (network hiccup, hotlink block,
 * private-network deployment). On error we hide the image so no
 * broken-image icon ever appears in the layout.
 */
export function Photo({ photo, className = "", loading = "lazy", ...rest }) {
    const [failed, setFailed] = useState(false);
    if (!photo || failed) {
        return null;
    }
    return (
        <img
            src={photo.src}
            alt={photo.alt}
            loading={loading}
            decoding="async"
            onError={() => setFailed(true)}
            className={className}
            {...rest}
        />
    );
}

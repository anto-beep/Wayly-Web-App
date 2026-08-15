// Loads the Wayly brand fonts (Playfair Display headings + IBM Plex body/mono)
// via expo-font. Kept separate from the icon-font loader so both can be gated
// in the root layout.
import { useFonts } from "expo-font";

export const useBrandFonts = (): readonly [boolean, Error | null] =>
  useFonts({
    "PlayfairDisplay-Bold": require("../../assets/fonts/PlayfairDisplay-Bold.ttf"),
    "PlayfairDisplay-SemiBold": require("../../assets/fonts/PlayfairDisplay-SemiBold.ttf"),
    "IBMPlexSans-Regular": require("../../assets/fonts/IBMPlexSans-Regular.ttf"),
    "IBMPlexSans-Medium": require("../../assets/fonts/IBMPlexSans-Medium.ttf"),
    "IBMPlexSans-SemiBold": require("../../assets/fonts/IBMPlexSans-SemiBold.ttf"),
    "IBMPlexSans-Bold": require("../../assets/fonts/IBMPlexSans-Bold.ttf"),
    "IBMPlexMono-Regular": require("../../assets/fonts/IBMPlexMono-Regular.ttf"),
    "IBMPlexMono-Medium": require("../../assets/fonts/IBMPlexMono-Medium.ttf"),
  });

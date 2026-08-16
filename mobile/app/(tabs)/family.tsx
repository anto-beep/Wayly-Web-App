import React, { useCallback, useState } from "react";
import {
  Alert,
  Image,
  KeyboardAvoidingView,
  Linking,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { Users, CloudOff, MessageSquare } from "lucide-react-native";
import * as ImagePicker from "expo-image-picker";

import { AppHeader, Loading, StatePanel, T } from "@/src/components/ui";
import { PageIntro } from "@/src/components/PageIntro";
import { ParticipantSwitcher } from "@/src/components/ParticipantSwitcher";
import { useAuth } from "@/src/context/AuthContext";
import { useParticipants } from "@/src/context/ParticipantContext";
import { apiFetch } from "@/src/lib/api";
import { useTheme } from "@/src/theme/ThemeContext";
import { fonts, radius, spacing } from "@/src/theme/tokens";
import { initials, timeAgo } from "@/src/utils/format";

type Post = {
  id: string;
  participant_id: string;
  kind: "message" | "photo" | "voice";
  body?: string | null;
  image_b64?: string | null;
  image_mime?: string | null;
  audio_b64?: string | null;
  author_id: string;
  author_name: string;
  reactions?: Record<string, number>;
  reacted_by?: Record<string, string[]>;
  created_at: string;
};

// Matches web REACT_EMOJIS verbatim.
const EMOJIS = ["❤️", "👍", "🙏", "😊", "😢"];

export default function FamilyWall() {
  const { user } = useAuth();
  const { active, activeId } = useParticipants();
  const { colors } = useTheme();
  const [posts, setPosts] = useState<Post[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(false);
  const [body, setBody] = useState("");
  const [photo, setPhoto] = useState<{ b64: string; mime: string } | null>(null);
  const [posting, setPosting] = useState(false);

  const load = useCallback(async () => {
    if (!activeId) {
      setLoading(false);
      return;
    }
    setError(false);
    try {
      const res = await apiFetch<{ items: Post[] }>(`/wall/posts?participant_id=${activeId}`);
      setPosts(res?.items || []);
    } catch {
      setError(true);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [activeId]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const openSettings = () =>
    Alert.alert("Allow photo access", "Wayly needs photo access to share pictures on the family wall.", [
      { text: "Not now", style: "cancel" },
      { text: "Open Settings", onPress: () => Linking.openSettings() },
    ]);

  const attachPhoto = async () => {
    const current = await ImagePicker.getMediaLibraryPermissionsAsync();
    let status = current.status;
    if (status !== "granted") {
      if (!current.canAskAgain) return openSettings();
      const req = await ImagePicker.requestMediaLibraryPermissionsAsync();
      status = req.status;
      if (status !== "granted") {
        if (!req.canAskAgain) return openSettings();
        return;
      }
    }
    const res = await ImagePicker.launchImageLibraryAsync({ quality: 0.6, base64: true });
    if (res.canceled || !res.assets?.[0]?.base64) return;
    const a = res.assets[0];
    setPhoto({ b64: a.base64 as string, mime: a.mimeType || "image/jpeg" });
  };

  const submit = async () => {
    if (!activeId || (!body.trim() && !photo) || posting) return;
    setPosting(true);
    try {
      const payload = photo
        ? { participant_id: activeId, kind: "photo", body: body.trim() || null, image_b64: photo.b64, image_mime: photo.mime }
        : { participant_id: activeId, kind: "message", body: body.trim() };
      await apiFetch("/wall/posts", { method: "POST", body: payload });
      setBody("");
      setPhoto(null);
      await load();
    } catch {
      Alert.alert("Couldn't post", "Please try again.");
    } finally {
      setPosting(false);
    }
  };

  const react = async (post: Post, emoji: string) => {
    const mine = new Set(post.reacted_by?.[user?.id || ""] || []);
    const reactions = { ...(post.reactions || {}) };
    if (mine.has(emoji)) reactions[emoji] = Math.max(0, (reactions[emoji] || 1) - 1);
    else reactions[emoji] = (reactions[emoji] || 0) + 1;
    setPosts((prev) => prev.map((p) => (p.id === post.id ? { ...p, reactions } : p)));
    try {
      await apiFetch(`/wall/posts/${post.id}/react`, { method: "POST", body: { emoji } });
    } catch {
      load();
    }
  };

  const remove = (post: Post) =>
    Alert.alert("Delete post", "Delete this post?", [
      { text: "Cancel", style: "cancel" },
      {
        text: "Delete",
        style: "destructive",
        onPress: async () => {
          setPosts((prev) => prev.filter((p) => p.id !== post.id));
          try {
            await apiFetch(`/wall/posts/${post.id}`, { method: "DELETE" });
          } catch {
            load();
          }
        },
      },
    ]);

  const pName = active?.display_name || "Your Participant";

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <AppHeader title="Family Wall" subtitle="Share updates with the family" />
      <View style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm }}>
        <ParticipantSwitcher householdName={user?.name} />
      </View>

      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        {!activeId ? (
          <StatePanel
            testID="wall-no-participant"
            icon={Users}
            title="Add a participant first"
            message="The family wall is shared per participant. Add someone you care for to start posting."
          />
        ) : loading ? (
          <Loading label="Loading the family wall…" />
        ) : error ? (
          <StatePanel testID="wall-error" icon={CloudOff} title="Couldn't load the wall" actionLabel="Retry" onAction={load} />
        ) : (
          <ScrollView
            contentContainerStyle={{ padding: spacing.lg, paddingBottom: spacing.xl, gap: spacing.md }}
            refreshControl={<RefreshControl refreshing={refreshing} onRefresh={() => { setRefreshing(true); load(); }} tintColor={colors.primary} />}
          >
            <PageIntro
              eyebrow="Family Wall"
              title={`A Digital Fridge Door for ${pName}`}
              description="A calm, shared space for photos, updates, and quick voice notes, so everyone who loves this person stays in the loop, without another group chat."
              whatItDoes="Threads photos, messages, and voice notes tied to the household. Only the family members you invite can see or contribute."
              howToUse={[
                "Snap a photo, type a short message, or leave a voice note.",
                "React with a heart or a comment to show you saw an update.",
                "Invite siblings and family so everyone sees the same wall.",
                "Everything stays here, no messages get lost between phones.",
              ]}
              whatYouGet={[
                "One shared record of the small moments that matter.",
                "Everyone updated without a dozen group SMS chains.",
                "A gentle timeline of the caring journey to look back on.",
              ]}
            />
            {posts.length === 0 ? (
              <StatePanel
                testID="wall-empty"
                icon={MessageSquare}
                title="No posts yet"
                message={`Be the first to share a moment with ${active?.display_name || "your family"}.`}
              />
            ) : (
              posts.map((p) => (
                <PostCard key={p.id} post={p} meId={user?.id || ""} onReact={react} onDelete={remove} />
              ))
            )}
          </ScrollView>
        )}

        {/* Composer */}
        {activeId ? (
          <View style={[styles.composer, { borderTopColor: colors.border, backgroundColor: colors.surface }]}>
            {photo ? (
              <View style={styles.photoPreview}>
                <Image source={{ uri: `data:${photo.mime};base64,${photo.b64}` }} style={[styles.previewImg, { backgroundColor: colors.surface2 }]} />
                <Pressable testID="wall-remove-photo" onPress={() => setPhoto(null)} style={[styles.removePhoto, { backgroundColor: colors.surface }]} hitSlop={8}>
                  <Ionicons name="close-circle" size={22} color={colors.terracotta} />
                </Pressable>
              </View>
            ) : null}
            <View style={styles.composerRow}>
              <Pressable testID="wall-attach-photo" onPress={attachPhoto} hitSlop={8} style={[styles.iconBtn, { backgroundColor: colors.sageSoft }]}>
                <Ionicons name="image" size={22} color={colors.primary} />
              </Pressable>
              <TextInput
                testID="wall-input"
                value={body}
                onChangeText={setBody}
                placeholder={`Share a moment, an update, or a memory with ${active?.display_name || "the family"}…`}
                placeholderTextColor={colors.muted}
                style={[styles.input, { backgroundColor: colors.bg, borderColor: colors.border, color: colors.text }]}
                multiline
              />
              <Pressable
                testID="wall-send"
                onPress={submit}
                disabled={posting || (!body.trim() && !photo)}
                style={[styles.sendBtn, { backgroundColor: colors.gold }, (posting || (!body.trim() && !photo)) && { opacity: 0.5 }]}
              >
                <Ionicons name="send" size={20} color="#fff" />
              </Pressable>
            </View>
          </View>
        ) : null}
      </KeyboardAvoidingView>
    </View>
  );
}

function PostCard({
  post,
  meId,
  onReact,
  onDelete,
}: {
  post: Post;
  meId: string;
  onReact: (p: Post, e: string) => void;
  onDelete: (p: Post) => void;
}) {
  const { colors, shadow } = useTheme();
  const mine = post.author_id === meId;
  const myReactions = new Set(post.reacted_by?.[meId] || []);
  return (
    <View testID={`wall-post-${post.id}`} style={[styles.post, { backgroundColor: colors.surface, borderColor: colors.border }, shadow.card]}>
      <View style={{ flexDirection: "row", alignItems: "center", gap: spacing.sm }}>
        <View style={[styles.avatar, { backgroundColor: colors.primary }]}>
          <T style={{ color: "#fff", fontFamily: fonts.bodyBold, fontSize: 14 }}>{initials(post.author_name).toUpperCase()}</T>
        </View>
        <View style={{ flex: 1 }}>
          <T style={{ fontFamily: fonts.bodySemi, fontSize: 15 }}>{post.author_name}</T>
          <T variant="small">{timeAgo(post.created_at)}</T>
        </View>
        {mine ? (
          <Pressable testID={`wall-delete-${post.id}`} onPress={() => onDelete(post)} hitSlop={8}>
            <Ionicons name="trash-outline" size={18} color={colors.muted} />
          </Pressable>
        ) : null}
      </View>

      {post.body ? <T style={{ fontFamily: fonts.body, fontSize: 15, lineHeight: 22, marginTop: spacing.sm }}>{post.body}</T> : null}

      {post.kind === "photo" && post.image_b64 ? (
        <Image
          source={{ uri: `data:${post.image_mime || "image/jpeg"};base64,${post.image_b64}` }}
          style={[styles.postImg, { backgroundColor: colors.surface2 }]}
          resizeMode="cover"
        />
      ) : null}

      {post.kind === "voice" ? (
        <View style={[styles.voiceCard, { backgroundColor: colors.sageSoft }]}>
          <Ionicons name="mic" size={18} color={colors.sage} />
          <T variant="small" style={{ color: colors.sage, flex: 1 }}>
            Voice note — open the Wayly web app to listen.
          </T>
        </View>
      ) : null}

      <View style={styles.reactRow}>
        {EMOJIS.map((e) => {
          const count = post.reactions?.[e] || 0;
          const active = myReactions.has(e);
          return (
            <Pressable
              key={e}
              testID={`wall-react-${post.id}-${e}`}
              onPress={() => onReact(post, e)}
              style={[styles.reactChip, { borderColor: colors.border, backgroundColor: colors.surface }, active && { backgroundColor: colors.sageSoft, borderColor: colors.sage }]}
            >
              <T style={{ fontSize: 15 }}>{e}</T>
              {count > 0 ? <T style={{ fontFamily: fonts.bodySemi, fontSize: 13, color: colors.muted }}>{count}</T> : null}
            </Pressable>
          );
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: { width: 40, height: 40, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  post: { borderRadius: radius.lg, borderWidth: 1, padding: spacing.md },
  postImg: { width: "100%", height: 220, borderRadius: radius.md, marginTop: spacing.sm },
  voiceCard: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: radius.md, padding: spacing.sm, marginTop: spacing.sm },
  reactRow: { flexDirection: "row", gap: spacing.sm, marginTop: spacing.md, flexWrap: "wrap" },
  reactChip: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: radius.pill, borderWidth: 1 },
  composer: { borderTopWidth: 1, padding: spacing.md },
  composerRow: { flexDirection: "row", alignItems: "flex-end", gap: spacing.sm },
  iconBtn: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  input: {
    flex: 1,
    maxHeight: 110,
    minHeight: 44,
    borderRadius: radius.lg,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingTop: Platform.OS === "ios" ? 12 : 8,
    fontFamily: fonts.body,
    fontSize: 15,
  },
  sendBtn: { width: 44, height: 44, borderRadius: radius.pill, alignItems: "center", justifyContent: "center" },
  photoPreview: { marginBottom: spacing.sm, alignSelf: "flex-start" },
  previewImg: { width: 84, height: 84, borderRadius: radius.md },
  removePhoto: { position: "absolute", top: -8, right: -8, borderRadius: radius.pill },
});

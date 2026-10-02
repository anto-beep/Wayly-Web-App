import React from "react";
import { View, Text, StyleProp, TextStyle } from "react-native";
import { fonts } from "@/src/theme/tokens";

/**
 * MarkdownText (mobile) — lightweight, dependency-free renderer for AI/chat
 * answers so markdown displays properly instead of leaking raw asterisks.
 * Handles: **bold** / __bold__, `- `/`* `/`• ` bullets, `1.` numbered lists,
 * and strips leading `#` heading markers (rendered as bold lines).
 */

function renderInline(text: string, baseStyle: StyleProp<TextStyle>, chipBg?: string, chipColor?: string) {
    const parts = String(text).split(/(\*\*[^*]+\*\*|__[^_]+__)/g);
    return parts.map((part, i) => {
        const m = /^\*\*([^*]+)\*\*$/.exec(part) || /^__([^_]+)__$/.exec(part);
        if (m) {
            const label = m[1];
            // Short bold spans (key figures, dates, deadlines the model bolds)
            // render as a coloured highlight chip so they pop for the reader.
            if (chipBg && label.trim().length <= 28) {
                return (
                    <Text key={i} style={[baseStyle, { fontFamily: fonts.bodySemi, color: chipColor, backgroundColor: chipBg }]}>
                        {` ${label} `}
                    </Text>
                );
            }
            return (
                <Text key={i} style={[baseStyle, { fontFamily: fonts.bodySemi }]}>
                    {label}
                </Text>
            );
        }
        return (
            <Text key={i} style={baseStyle}>
                {part}
            </Text>
        );
    });
}

type Props = { content?: string | null; color: string; size?: number; lineHeight?: number; chipBg?: string; chipColor?: string };

export default function MarkdownText({ content, color, size = 15, lineHeight = 22, chipBg, chipColor }: Props) {
    const base: TextStyle = { fontFamily: fonts.body, fontSize: size, lineHeight, color };
    const lines = String(content || "").split(/\r?\n/);

    return (
        <View>
            {lines.map((raw, idx) => {
                const isHeading = /^\s*#{1,6}\s+/.test(raw);
                const line = raw.replace(/^\s*#{1,6}\s+/, "");
                if (line.trim() === "") return <View key={idx} style={{ height: 6 }} />;

                const bullet = /^\s*[-*•]\s+/.test(line);
                const numMatch = /^\s*(\d+)\.\s+/.exec(line);
                const body = line.replace(/^\s*[-*•]\s+/, "").replace(/^\s*\d+\.\s+/, "");

                if (bullet || numMatch) {
                    return (
                        <View key={idx} style={{ flexDirection: "row", marginBottom: 3 }}>
                            <Text style={[base, { width: numMatch ? 22 : 16 }]}>
                                {numMatch ? `${numMatch[1]}.` : "•"}
                            </Text>
                            <Text style={[base, { flex: 1 }]}>{renderInline(body, base, chipBg, chipColor)}</Text>
                        </View>
                    );
                }

                return (
                    <Text
                        key={idx}
                        style={[base, { marginBottom: 3, fontFamily: isHeading ? fonts.bodySemi : fonts.body }]}
                    >
                        {renderInline(line, base, chipBg, chipColor)}
                    </Text>
                );
            })}
        </View>
    );
}

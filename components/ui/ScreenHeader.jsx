import { Ionicons } from "@expo/vector-icons";
import { StyleSheet, Text, TouchableOpacity, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

/**
 * Reusable hero header with brand background, decorative blob, title, subtitle, and optional back button.
 * Used across dashboards and form screens for consistent premium look.
 */
export default function ScreenHeader({
    title,
    subtitle,
    showBack = false,
    onBack,
    rightAction,
    height = 220,
    children,
}) {
    const { colors } = useTheme();

    return (
        <View style={[styles.hero, { backgroundColor: colors.brand, height }]}>
            {/* Decorative blobs */}
            <View style={styles.blobOne} />
            <View style={styles.blobTwo} />

            {/* Top row: back button + right action */}
            <View style={styles.topRow}>
                {showBack && onBack ? (
                    <TouchableOpacity style={styles.backBtn} onPress={onBack} activeOpacity={0.7}>
                        <Ionicons name="arrow-back" size={22} color="#FFFFFF" />
                    </TouchableOpacity>
                ) : (
                    <View style={{ width: 40 }} />
                )}
                {rightAction || <View style={{ width: 40 }} />}
            </View>

            {/* Content */}
            <View style={styles.content}>
                {title ? <Text style={styles.title}>{title}</Text> : null}
                {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
                {children}
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    hero: {
        paddingHorizontal: 24,
        paddingTop: 48,
        paddingBottom: 24,
        borderBottomLeftRadius: 32,
        borderBottomRightRadius: 32,
        overflow: "hidden",
    },
    blobOne: {
        position: "absolute",
        top: -40,
        right: -30,
        width: 180,
        height: 180,
        backgroundColor: "rgba(255,255,255,0.12)",
        borderRadius: 90,
    },
    blobTwo: {
        position: "absolute",
        bottom: -60,
        left: -40,
        width: 200,
        height: 200,
        backgroundColor: "rgba(255,255,255,0.08)",
        borderRadius: 100,
    },
    topRow: {
        flexDirection: "row",
        justifyContent: "space-between",
        alignItems: "center",
        marginBottom: 16,
    },
    backBtn: {
        width: 40,
        height: 40,
        borderRadius: 12,
        backgroundColor: "rgba(255,255,255,0.2)",
        justifyContent: "center",
        alignItems: "center",
    },
    content: {
        flex: 1,
        justifyContent: "center",
    },
    title: {
        color: "#FFFFFF",
        fontSize: 28,
        fontWeight: "900",
        letterSpacing: 0.3,
    },
    subtitle: {
        color: "rgba(255,255,255,0.8)",
        fontSize: 15,
        fontWeight: "500",
        marginTop: 6,
        lineHeight: 22,
    },
});

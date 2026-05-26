import AsyncStorage from "@react-native-async-storage/async-storage";
import { DrawerContentScrollView, DrawerItemList } from "@react-navigation/drawer";
import { useEffect, useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

export default function CustomDrawerContent(props) {
    const { colors, language: appLang } = useTheme();
    const tr = (en, ur) => (appLang === "ur" ? ur : en);
    const [userData, setUserData] = useState(null);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const stored = await AsyncStorage.getItem("userData");
                if (stored) setUserData(JSON.parse(stored));
            } catch (e) {
                console.log("Error loading user for drawer", e);
            }
        };
        loadUser();
    }, []);

    return (
        <View style={{ flex: 1, backgroundColor: colors.background }}>
            <View style={[styles.header, { backgroundColor: colors.brand }]}>
                <View style={styles.headerBlob} />

                <View style={styles.profileContainer}>
                    <View style={[styles.avatarContainer, { borderColor: 'rgba(255,255,255,0.3)' }]}>
                        <Image
                            source={{ uri: userData?.profilePicture || userData?.profileImage || "https://ui-avatars.com/api/?name=" + (userData?.fullName || userData?.name || "User") + "&background=random" }}
                            style={styles.avatar}
                        />
                    </View>

                    <View style={styles.infoContainer}>
                        <Text style={styles.userName} numberOfLines={1}>
                            {userData?.fullName || userData?.name || tr("Guest User", "مہمان صارف")}
                        </Text>
                        <Text style={styles.userEmail} numberOfLines={1}>
                            {userData?.email || "user@example.com"}
                        </Text>
                        <View style={styles.roleBadge}>
                            <Text style={styles.roleText}>
                                {tr(userData?.role?.toUpperCase() || "USER", (userData?.role || "user").toUpperCase())}
                            </Text>
                        </View>
                    </View>
                </View>
            </View>

            <DrawerContentScrollView {...props} contentContainerStyle={{ paddingTop: 10 }}>
                <DrawerItemList {...props} />
            </DrawerContentScrollView>

            <View style={[styles.footer, { borderTopColor: colors.border }]}>
                <Text style={[styles.footerText, { color: colors.textSecondary }]}>
                    {tr("App Version 2.4.0", "ایپ ورژن 2.4.0")}
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    header: {
        height: 180,
        justifyContent: "flex-end",
        paddingBottom: 24,
        paddingHorizontal: 20,
        overflow: "hidden",
    },
    headerBlob: {
        position: "absolute",
        right: -30,
        top: -30,
        width: 140,
        height: 140,
        borderRadius: 70,
        backgroundColor: "rgba(255,255,255,0.12)",
    },
    profileContainer: {
        flexDirection: "row",
        alignItems: "center",
        gap: 16,
    },
    avatarContainer: {
        width: 64,
        height: 64,
        borderRadius: 32,
        borderWidth: 2,
        padding: 2,
        backgroundColor: 'rgba(255,255,255,0.1)',
    },
    avatar: {
        width: "100%",
        height: "100%",
        borderRadius: 30,
    },
    infoContainer: {
        flex: 1,
        gap: 2,
    },
    userName: {
        color: "#FFF",
        fontSize: 18,
        fontWeight: "900",
        letterSpacing: 0.3,
    },
    userEmail: {
        color: "rgba(255,255,255,0.7)",
        fontSize: 12,
        fontWeight: "600",
    },
    roleBadge: {
        backgroundColor: "rgba(255,255,255,0.2)",
        paddingHorizontal: 8,
        paddingVertical: 2,
        borderRadius: 6,
        alignSelf: "flex-start",
        marginTop: 4,
    },
    roleText: {
        color: "#FFF",
        fontSize: 10,
        fontWeight: "800",
        letterSpacing: 1,
    },
    footer: {
        padding: 20,
        borderTopWidth: 1,
    },
    footerText: {
        fontSize: 11,
        fontWeight: "700",
        textAlign: "center",
        letterSpacing: 0.5,
    },
});

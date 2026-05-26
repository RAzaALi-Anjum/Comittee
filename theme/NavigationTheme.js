/**
 * Centralized navigation screen options.
 * Replaces all hardcoded headerStyle: { backgroundColor: "#800000" }
 * across the app with theme-aware values.
 */

export function getScreenOptions(colors) {
    return {
        headerStyle: {
            backgroundColor: colors.brand,
            elevation: 0,
            shadowOpacity: 0,
            borderBottomWidth: 0,
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
            fontWeight: "700",
            fontSize: 18,
            letterSpacing: 0.3,
        },
        headerBackTitleVisible: false,
    };
}

export function getTabBarOptions(colors) {
    return {
        headerShown: false,
        tabBarActiveTintColor: colors.brand,
        tabBarInactiveTintColor: colors.textSecondary + '90',
        tabBarStyle: {
            backgroundColor: colors.card,
            height: 68,
            paddingBottom: 10,
            paddingTop: 8,
            borderTopWidth: 1,
            borderTopColor: colors.border,
            elevation: 10,
            shadowColor: "#000",
            shadowOpacity: 0.1,
            shadowRadius: 15,
            shadowOffset: { width: 0, height: -4 },
        },
        tabBarLabelStyle: {
            fontSize: 12,
            fontWeight: "700",
            letterSpacing: 0.4,
            marginTop: 2,
        },
        tabBarHideOnKeyboard: true,
    };
}

export function getDrawerOptions(colors) {
    return {
        headerStyle: {
            backgroundColor: colors.brand,
            elevation: 0,
            shadowOpacity: 0,
            height: 100,
        },
        headerTintColor: "#FFFFFF",
        headerTitleStyle: {
            fontWeight: "900",
            fontSize: 20,
            letterSpacing: 0.5,
        },
        drawerActiveTintColor: colors.brand,
        drawerInactiveTintColor: colors.text + '90',
        drawerActiveBackgroundColor: colors.brand + '10',
        drawerLabelStyle: {
            fontWeight: "700",
            fontSize: 14,
            marginLeft: -10,
        },
        drawerItemStyle: {
            borderRadius: 12,
            marginHorizontal: 12,
            paddingVertical: 2,
        },
        drawerStyle: {
            backgroundColor: colors.background,
            width: 280,
        },
        sceneContainerStyle: { backgroundColor: colors.background },
    };
}

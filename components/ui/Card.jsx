import { StyleSheet, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

const Card = ({ children, style, padding = "md", elevation = "sm" }) => {
    const { colors } = useTheme();

    const paddings = {
        none: 0,
        sm: 8,
        md: 16,
        lg: 24,
    };

    const elevations = {
        none: {},
        sm: {
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 2 },
            shadowOpacity: 0.1,
            shadowRadius: 4,
            elevation: 3,
        },
        md: {
            shadowColor: colors.shadow,
            shadowOffset: { width: 0, height: 4 },
            shadowOpacity: 0.15,
            shadowRadius: 8,
            elevation: 5,
        },
    };

    return (
        <View
            style={[
                styles.card,
                {
                    backgroundColor: colors.card,
                    borderColor: colors.border,
                    padding: paddings[padding],
                },
                elevations[elevation],
                style,
            ]}
        >
            {children}
        </View>
    );
};

const styles = StyleSheet.create({
    card: {
        borderRadius: 16,
        borderWidth: 1,
    },
});

export default Card;

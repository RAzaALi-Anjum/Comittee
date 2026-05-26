import { Text } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

const Typography = ({
    children,
    variant = "body",
    color: customColor,
    textAlign = "left",
    style,
    ...props
}) => {
    const { colors } = useTheme();

    const variants = {
        h1: {
            fontSize: 32,
            fontWeight: "900",
            lineHeight: 40,
        },
        h2: {
            fontSize: 24,
            fontWeight: "800",
            lineHeight: 32,
        },
        h3: {
            fontSize: 20,
            fontWeight: "700",
            lineHeight: 28,
        },
        subtitle: {
            fontSize: 16,
            fontWeight: "600",
            lineHeight: 24,
        },
        body: {
            fontSize: 16,
            fontWeight: "400",
            lineHeight: 24,
        },
        bodySmall: {
            fontSize: 14,
            fontWeight: "400",
            lineHeight: 20,
        },
        caption: {
            fontSize: 12,
            fontWeight: "500",
            lineHeight: 16,
            letterSpacing: 0.5,
            textTransform: "uppercase",
        },
    };

    const colorStyles = {
        primary: colors.text,
        secondary: colors.textSecondary,
        brand: colors.brand,
        danger: colors.danger,
        success: colors.success,
        white: "#FFFFFF",
    };

    const finalColor = customColor || colorStyles.primary;

    return (
        <Text
            style={[
                variants[variant] || variants.body,
                { color: finalColor, textAlign },
                style,
            ]}
            {...props}
        >
            {children}
        </Text>
    );
};

export default Typography;

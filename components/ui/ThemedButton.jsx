import React from "react";
import { ActivityIndicator, Text, TouchableOpacity } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

export default function ThemedButton({
  label,
  onPress,
  variant = "primary",
  disabled = false,
  loading = false,
  style,
  textStyle,
}) {
  const { colors } = useTheme();

  const getButtonStyle = () => {
    const base = {
      paddingVertical: 16,
      paddingHorizontal: 24,
      borderRadius: 14,
      alignItems: "center",
      justifyContent: "center",
      flexDirection: "row",
      transition: "all 0.2s",
    };

    const variants = {
      primary: {
        backgroundColor: colors.brand,
        shadowColor: colors.brand,
        shadowOffset: { width: 0, height: 4 },
        shadowOpacity: 0.3,
        shadowRadius: 8,
        elevation: 6,
      },
      secondary: {
        backgroundColor: colors.brandLight,
      },
      outline: {
        backgroundColor: "transparent",
        borderWidth: 2,
        borderColor: colors.brand,
      },
      ghost: {
        backgroundColor: "transparent",
      },
      danger: {
        backgroundColor: colors.danger,
      },
    };

    return [base, variants[variant], disabled && { opacity: 0.5, elevation: 0 }, style];
  };

  const getTextStyle = () => {
    const base = {
      fontSize: 16,
      fontWeight: "700",
      letterSpacing: 0.5,
    };

    const variants = {
      primary: { color: "#FFFFFF" },
      secondary: { color: colors.brand },
      outline: { color: colors.brand },
      ghost: { color: colors.brand },
      danger: { color: "#FFFFFF" },
    };

    return [base, variants[variant], textStyle];
  };

  return (
    <TouchableOpacity
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.7}
      style={getButtonStyle()}
    >
      {loading ? (
        <ActivityIndicator color={variant === "primary" || variant === "danger" ? "#FFFFFF" : colors.brand} />
      ) : (
        <Text style={getTextStyle()}>{label}</Text>
      )}
    </TouchableOpacity>
  );
}

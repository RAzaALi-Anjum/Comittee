import React from "react";
import { Text, TextInput, View } from "react-native";
import { useTheme } from "../../theme/ThemeProvider";

export default function ThemedInput({
  label,
  value,
  onChangeText,
  keyboardType,
  placeholder,
  multiline = false,
  style,
  inputStyle,
  ...rest
}) {
  const { colors } = useTheme();
  const [isFocused, setIsFocused] = React.useState(false);

  return (
    <View style={[{ marginBottom: 16 }, style]}>
      {label ? (
        <Text style={{
          fontWeight: "700",
          marginBottom: 8,
          color: colors?.text || "#111827",
          fontSize: 14,
          opacity: 0.9
        }}>
          {label}
        </Text>
      ) : null}
      <TextInput
        value={value}
        onChangeText={onChangeText}
        keyboardType={keyboardType}
        placeholder={placeholder}
        multiline={multiline}
        onFocus={() => setIsFocused(true)}
        onBlur={() => setIsFocused(false)}
        style={[
          {
            borderWidth: 1.5,
            borderColor: isFocused ? (colors?.brand || "#800000") : (colors?.border || "#D1D5DB"),
            borderRadius: 12,
            paddingHorizontal: 16,
            paddingVertical: 14,
            backgroundColor: colors?.card || "#FFFFFF",
            color: colors?.text || "#0F172A",
            fontSize: 16,
          },
          inputStyle,
        ]}
        placeholderTextColor={colors?.textSecondary || "#94A3B8"}
        {...rest}
      />
    </View>
  );
}


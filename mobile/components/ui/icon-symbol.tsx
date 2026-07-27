import React from "react";
import { Text, TextProps } from "react-native";

export function IconSymbol({ name, ...props }: TextProps & { name?: string }) {
  return <Text {...props}>{name || "•"}</Text>;
}

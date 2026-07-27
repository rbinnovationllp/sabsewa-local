import React from "react";
import { Linking, Text, TextProps } from "react-native";

export function ExternalLink({ href, children, ...props }: TextProps & { href: string }) {
  return (
    <Text {...props} onPress={() => Linking.openURL(href)}>
      {children}
    </Text>
  );
}

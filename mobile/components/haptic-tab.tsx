import React from "react";
import { TouchableOpacity, TouchableOpacityProps } from "react-native";

export function HapticTab(props: TouchableOpacityProps) {
  return <TouchableOpacity activeOpacity={0.75} {...props} />;
}

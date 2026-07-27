import React, { useState } from "react";
import { Text, TouchableOpacity, View } from "react-native";

export function Collapsible({ title, children }: { title: string; children: React.ReactNode }) {
  const [open, setOpen] = useState(false);
  return (
    <View>
      <TouchableOpacity onPress={() => setOpen((current) => !current)}>
        <Text style={{ fontWeight: "900" }}>{title}</Text>
      </TouchableOpacity>
      {open ? <View>{children}</View> : null}
    </View>
  );
}

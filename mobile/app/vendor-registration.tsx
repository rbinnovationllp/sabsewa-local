import { Redirect } from "expo-router";

export default function VendorRegistrationRoute() {
  return <Redirect href={{ pathname: "/auth/Register", params: { role: "vendor" } }} />;
}

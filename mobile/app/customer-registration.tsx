import { Redirect } from "expo-router";

export default function CustomerRegistrationRoute() {
  return <Redirect href={{ pathname: "/auth/Register", params: { role: "customer" } }} />;
}
